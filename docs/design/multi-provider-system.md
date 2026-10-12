# True Multi-Provider System — Design & Build Plan
### Dynamic model discovery (Ollama + cloud catalogs) · Named API-key profiles with one-active semantics · Live verification · Provider modal ("The Foundry")

**Status:** design proposal, ready to build
**Verified enabler:** `@earendil-works/pi-ai@1.1.0` accepts a **per-request `apiKey`** (`ProviderRequestOptions.apiKey`, `dist/types.d.ts:63`; consumed e.g. in `anthropic-messages.js:410`) plus per-request `signal`, `maxTokens`, `samplingParams`. No provider re-instantiation, no env mutation, no AsyncLocalStorage — the gateway can serve any key on any request.
**Supersedes/retires findings:** G1 & G6 (static `*_MODEL` env drift — selections become catalog-validated at pick time), gateway's unused `*_MODEL` envs (deleted), harness B1's hardcoded per-provider token map (replaced by catalog metadata), architecture.md's "mid-flight provider cancellation is a documented limitation" (options.signal makes it real — stretch).

---

## 1. Principles (extending spec §3.2, not violating it)

Spec §3.2 says: *"Never accept an arbitrary API base URL or secret from the browser. Browser sends a provider enum. Backend maps it to allowlisted configuration."* Reading it whole, the invariant is: **the generation path carries identifiers, never credentials or URLs.** Key *provisioning* is a distinct configuration surface — the operator types a key into a settings modal once, exactly as they would into `.env`, and from then on every generation request carries only `provider` + `model_id` (+ nothing secret). This design keeps that invariant and should be recorded as a one-paragraph ADR (repo discipline).

1. **Server owns resolution.** The browser never chooses which key runs; it chooses a provider, and the server resolves the *active* key profile. One active key per provider, enforced in the database.
2. **Secrets are write-only.** Entered once over the API, encrypted at rest, never returned, never logged, never sent to the gateway's logs, masked to a fingerprint everywhere (UI, errors, DB queries).
3. **Discovery replaces static allowlists.** The allowlist becomes: Ollama's live `/api/tags` (local) and pi-ai's provider catalog served by the gateway (cloud). Still server-owned, still exact-match, never client-invented.
4. **No silent fallbacks.** Missing/invalid key → typed, actionable error ("Bind a Gemini key in The Foundry") — never a quiet switch to another provider (spec §11.2).
5. **Env keys are profiles too.** `GEMINI_API_KEY` etc. from `.env` are seeded as read-only profiles named `env default` — zero-regression migration; the whole system runs through one code path.
6. **Verification is honest.** A ping classifies `valid / invalid_key / rate_limited / unreachable / unknown` — 429 means the key *works*; the UI says so rather than flashing red.

---

## 2. Architecture

```
                 ┌────────────────────────── Browser ──────────────────────────┐
                 │  The Foundry modal: discovery lists · key profiles · verify │
                 └───────┬──────────────────────────────────────┬──────────────┘
                         │ REST (ids/enums only,                │ POST key ONCE at setup
                         │ never secrets on gen path)           │ (SecretStr, one-way)
                 ┌───────▼──────────────────────────────────────▼──────────────┐
                 │ FastAPI                                                      │
                 │  providers_api: /models /keys /activate /verify             │
                 │  KeyStore (Fernet, master key from env, fail-closed)        │
                 │  KeyVerifier (per-provider minimal HTTPS probe)             │
                 │  DiscoveryCache (ollama tags TTL 60s · catalog TTL 1h)      │
                 │  resolve_generation_target(): model∈catalog ∧ active key    │
                 └───────┬──────────────────────────────────────┬──────────────┘
        internal token   │ generate(payload + api_key)          │ GET /api/v1/models
                 ┌───────▼──────────────────────────────────────▼──────────────┐
                 │ agent-gateway: models.complete(model, ctx,                  │
                 │   { apiKey, maxTokens, samplingParams, signal })            │
                 └───────────────────────────┬─────────────────────────────────┘
                                 Ollama (keyless) · Gemini · Anthropic · OpenAI
```

Postgres gains one table (`provider_keys`). The gateway gains one read-only endpoint (`/api/v1/models`) and one optional payload field (`api_key`). The generate contract otherwise does not change.

---

## 3. Database (migration `0006_provider_keys`)

```python
def upgrade() -> None:
    op.create_table(
        "provider_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),  # future multi-user
        sa.Column("provider", sa.String(16), nullable=False),      # gemini | anthropic | openai
        sa.Column("name", sa.String(64), nullable=False),          # "Work", "Personal", "env default"
        sa.Column("source", sa.String(8), nullable=False, server_default="user"),  # user | env
        sa.Column("encrypted_key", sa.LargeBinary(), nullable=False),
        sa.Column("key_sha256_prefix", sa.String(16), nullable=False),  # dup detection
        sa.Column("fingerprint", sa.String(24), nullable=False),   # display: "sk-a…Q4vz"
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(16), nullable=True),    # valid|invalid_key|rate_limited|unreachable|unknown
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("provider IN ('gemini','anthropic','openai')", name="chk_provider_keys_provider"),
    )
    # THE invariant: at most one active key per provider, enforced by the database itself
    op.create_index("uq_provider_keys_one_active", "provider_keys", ["provider"],
                    unique=True, postgresql_where=sa.text("is_active"))
    # nice-to-have: warn on re-adding an identical key
    op.create_index("ix_provider_keys_sha", "provider_keys", ["provider", "key_sha256_prefix"])
```

ORM mirrors the constraints in `__table_args__` (fixing the BA10c pattern — metadata is the single source of truth). `user_id` nullable now, populated with `DEMO_USER_ID`; when auth lands, key ownership is a WHERE-clause away.

**Env seeding** runs in the new lifespan hook (BA8 synergy), idempotent by `(provider, source='env', key_sha256_prefix)`:

```python
# main.py lifespan (also hosts the shared httpx client — BA7)
async def seed_env_key_profiles(session_factory):
    for provider, key in (("gemini", settings.GEMINI_API_KEY),
                          ("anthropic", settings.ANTHROPIC_API_KEY),
                          ("openai", settings.OPENAI_API_KEY)):
        if key:
            await key_store.upsert_env_profile(provider, key)   # name="env default", source="env",
                                                                # active only if provider has none
```

---

## 4. KeyStore — encryption & redaction (`backend/app/security/keystore.py`)

```python
from cryptography.fernet import Fernet, InvalidToken

class KeyStoreError(RuntimeError): ...

class KeyStore:
    """Encrypted key storage. Fail-closed: without KEYS_ENCRYPTION_KEY, storing
    keys is refused (like the gateway's INTERNAL_SERVICE_TOKEN gate)."""

    def __init__(self, master_key: str | None) -> None:
        self._fernet = Fernet(master_key.encode()) if master_key else None

    def _require(self) -> Fernet:
        if self._fernet is None:
            raise KeyStoreError(
                "KEYS_ENCRYPTION_KEY is not configured; refusing to store provider keys. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        return self._fernet

    def encrypt(self, plaintext: str) -> bytes:
        return self._require().encrypt(plaintext.encode())

    def decrypt(self, token: bytes) -> str:
        try:
            return self._require().decrypt(token).decode()
        except InvalidToken as exc:
            raise KeyStoreError("Stored key failed to decrypt (master key rotated?)") from exc

    @staticmethod
    def fingerprint(plaintext: str) -> str:
        head = plaintext[:3].rstrip("-")            # "sk-" style prefix
        return f"{head}…{plaintext[-4:]}"

    @staticmethod
    def sha_prefix(plaintext: str) -> str:
        return hashlib.sha256(plaintext.encode()).hexdigest()[:16]
```

Redaction rules (each gets a negative test — the repo loves payload tests):
- API schemas use `SecretStr` for `api_key`; it is excluded from every response model and from `repr` in logs.
- The gateway payload field `api_key` is stripped from any logged body (gateway already logs counts-only ✓; add an explicit delete-before-log guard).
- Error messages may contain `fingerprint`, never material.
- `KEYS_ENCRYPTION_KEY` joins the `.env.example` required-when-using-keys section + compose `${KEYS_ENCRYPTION_KEY:-}` passthrough (G6 discipline).

**Threat model, stated plainly (README + modal copy):** single-user local demo — encryption at rest protects against casual DB inspection and backup leakage; anyone holding both the DB and the master env can decrypt (inherent to self-hosted key vaults). HTTPS is mandatory the moment this is exposed beyond localhost. Multi-user requires per-user ownership scoping (column already present).

---

## 5. Verification (`backend/app/security/key_verifier.py`) — cheap, provider-native, no generation spend where avoidable

| Provider | Probe | valid | invalid_key | rate_limited |
|---|---|---|---|---|
| OpenAI | `GET https://api.openai.com/v1/models` (Bearer) | 200 | 401 | 429 |
| Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models?key=…` | 200 | 400/403 with API_KEY_INVALID | 429 |
| Anthropic | `GET https://api.anthropic.com/v1/models` (x-api-key + anthropic-version) | 200 | 401 | 429 |
| Ollama | `GET {base}/api/tags` + selected model ∈ tags (keyless — "verify" = reachability + model presence) | 200 ∧ model found | n/a | n/a |

```python
VERIFY_TIMEOUT = 6.0
async def verify_key(provider: str, plaintext: str, client: httpx.AsyncClient) -> Verification:
    # returns Verification(status, checked_at, detail_category)  — detail is a CATEGORY, never raw body
    # network errors → "unreachable"; unexpected statuses → "unknown" (logged server-side in full)
```
- Runs on: key creation (auto), explicit "Verify" click, and **activation** (a 401 blocks activation with `KEY_INVALID`; `rate_limited`/`unreachable` activate *with a warning stamp* — throttled ≠ broken).
- Also runs opportunistically at generation failure: gateway 401/403 → backend re-verifies the active key in the background and flips `last_status`, so the UI dot tells the truth next open.
- Rate-limited: 10 verify calls/min/provider in-memory token bucket (no dependency).

---

## 6. Discovery — models you can actually pick

**Gateway addition (`server.ts`):**
```ts
app.get("/api/v1/models", authenticateInternal, (req, res) => {
  const provider = String(req.query.provider || "");
  const meta = CLOUD_PROVIDER_META[provider];
  if (!meta) return res.status(404).json({ error: "provider_not_supported" });
  const models = models.getModels(meta.providerId).map((m) => ({
    id: m.id, name: m.name, context_window: m.contextWindow,
    max_tokens: m.maxTokens, cost: m.cost, reasoning: m.reasoning,
  }));
  res.json({ provider, source: "pi-ai-catalog", models });
});
```

**Backend (`GET /api/v1/providers/{provider}/models`)** — the only discovery surface the browser talks to:
- `ollama`: live `GET {OLLAMA_BASE_URL}/api/tags`, TTL-cached 60s; maps `{name, size_bytes, family, modified_at, details.quantization_level}`; `source: "ollama"`.
- cloud: proxies the gateway catalog, TTL-cached 1h (catalog is static per gateway build); `source: "catalog"`.
- Response includes `fit` computed server-side from the **catalog context window vs the current prompt-budget math** (harness B1): `ok | tight | too_small` — the picker can badge "too small for full-evidence turns" on e.g. a 4k-context local model. This is where discovery pays for the earlier audit: per-model `maxTokens`/`contextWindow` replace every hardcoded limit map.

**Resolution chain (replaces `allowed_model_ids`):**
```python
async def resolve_generation_target(provider, cloud_provider, model_id) -> GenerationTarget:
    if provider == "local":
        tags = await discovery.ollama_models()                    # cached
        if model_id not in {m.name for m in tags}:
            raise ModelNotAllowedError(f"Local model '{model_id}' is not installed in Ollama. Pull it (ollama pull {model_id}) or pick another.")
        return GenerationTarget(model_id=model_id, api_key=None, meta=...)
    catalog = await discovery.catalog_models(cloud_provider)      # cached, via gateway
    if model_id not in {m.id for m in catalog}:
        raise ModelNotAllowedError(f"Model '{model_id}' is not in the {cloud_provider} catalog.")
    profile = await key_store.active_profile(cloud_provider)
    if profile is None:
        raise ProviderKeyMissingError(cloud_provider)             # 422, non-retryable, actionable
    return GenerationTarget(model_id=model_id, api_key=key_store.decrypt(profile.encrypted_key),
                            meta=catalog_meta(model_id))
```
`ProviderKeyMissingError` classifies to `("PROVIDER_KEY_MISSING", "No active {provider} key. Bind one in The Foundry — or switch provider.", False)`. The gateway keeps its exact-match catalog check (defense in depth) and its `missing_api_key` 400 becomes unreachable in normal flow (env fallback only).

---

## 7. Gateway generate — per-request credentials & limits

```ts
// zod additions
api_key: z.string().optional(),          // resolved server-side by FastAPI; internal channel only

// generation call becomes:
const catalogMeta = targetModel;          // contextWindow/maxTokens from the model object itself
const completeOptions: Record<string, unknown> = {
  maxTokens: Math.min(Number(process.env.MAX_OUTPUT_TOKENS || 8192), catalogMeta.maxTokens || 8192),
};
if (payload.provider === "cloud" || payload.api_key) completeOptions.apiKey = payload.api_key;
if (payload.provider === "local" && process.env.OLLAMA_NUM_CTX) {
  completeOptions.samplingParams = { options: { num_ctx: Number(process.env.OLLAMA_NUM_CTX) } };
}
const assistantResult = await models.complete(targetModel, piContext, completeOptions as never);
```
- Delete the `apiKeyByProvider` env lookup (env keys arrive as seeded profiles through the same field) — one auth path, not two. Keep a one-release fallback only if you want rolling deploys; otherwise cut.
- Never log `payload.api_key` (guard + test).
- **Stretch (real cancellation):** on express `req.on("close")` fire an `AbortController` into `completeOptions.signal` — this retires architecture.md's "provider call completes and result is discarded" limitation; the backend's 0.3s disconnect poll already triggers the close.
- Verify `options.apiKey` on google/openai adapters with a 5-minute live probe each (anthropic confirmed in source; the contract is shared, but trust-and-verify is house doctrine).

`gateway_client.generate()` gains `api_key: str | None` into the payload; nothing else changes on the wire.

---

## 8. REST contract (all under existing auth stub + ownership discipline)

```
GET    /api/v1/providers/{p}/models            → {models[], cached_at, source, fit_budget?}
GET    /api/v1/providers/{p}/keys              → [{id,name,fingerprint,source,is_active,last_verified_at,last_status}]   (never secrets)
POST   /api/v1/providers/{p}/keys              {name, api_key:SecretStr, activate?:bool} → 201 {profile, verification}
PATCH  /api/v1/providers/{p}/keys/{id}         {name} → {profile}                       (env profiles: rename blocked)
POST   /api/v1/providers/{p}/keys/{id}/activate → {profile, verification}               (409 KEY_INVALID on 401-verify)
POST   /api/v1/providers/{p}/keys/{id}/verify  → {status, checked_at}
DELETE /api/v1/providers/{p}/keys/{id}         → 204                                    (env profiles: 409, edit .env)
```
Activation is one transaction: `UPDATE … SET is_active = (id = :target) WHERE provider = :p` — the partial unique index makes double-active impossible even under races. Deleting the active key is allowed; the provider simply reports `no active key` (dot goes amber, generation gives PROVIDER_KEY_MISSING). Ollama: `keys` endpoints return `[]`/405 — local needs no credentials, and the UI says exactly that ("Ollama trusts the host — no key required").

---

## 9. The Foundry — provider & credentials modal (frontend spec)

Opened from the RunningHead colophon chip (the existing popover becomes the *summary*; the modal is the full surface). Dossier voice throughout; security posture as aesthetic, same as the sandbox stamp.

**Layout:** left spine = provider index (Ollama · Gemini · Anthropic · OpenAI) with status dots (`ready` / `no key` / `unreachable`) — this is where the design doc's provider **dot-travel FLIP** (§8.4) finally has somewhere real to travel. Right pane per provider:

```
┌─ OLLAMA ────────────────────────────────────────────────┐
│ ● reachable · http://host:11434 · v0.40.2               │
│ MODELS ON HOST                            [↻ refresh]   │
│ ○ qwen2.5:1.5b    1.5B · Q4_K_M · 32k ctx   ⚠ tight fit │
│ ● qwen3:8b        8B  · Q4_K_M · 32k ctx    ✓ fit       │
│ No key required — Ollama trusts the host machine.       │
└─────────────────────────────────────────────────────────┘
┌─ ANTHROPIC ─────────────────────────────────────────────┐
│ CREDENTIALS                          [+ Bind a key]     │
│ ● Work          sk-a…Q4vz   verified 2m ago   [Verify]  │
│ ○ Personal      sk-a…91bc   rate-limited ⚠    [Verify]  │
│ ○ env default   ac9f…3e21   bound from .env   (locked)  │
│   one active at a time · keys are encrypted at rest,    │
│   never returned to this browser, never logged          │
│ MODELS (catalog · 5)                                    │
│ ● claude-sonnet-5      200k ctx · $3/$15 per M          │
│ ○ claude-sonnet-4-6    200k ctx · …                     │
└─────────────────────────────────────────────────────────┘
Footer:  Set in claude-sonnet-5 · Anthropic (Work)   [Use in composer]
```

**Behaviors:**
- *Bind a key* → inline form (name + paste) → POST → auto-verify → toast in house voice: **“Key bound — Anthropic · sk-a…Q4vz verified”** or **“Key refused by Anthropic (401) — check and rebind”**; 429 → **“Key valid — Anthropic is throttling it right now”** with an amber stamp, not an error.
- Active selection = radio semantics (`aria-checked`), optimistic UI with rollback on 409.
- Model rows: id, context window, cost tier, **fit badge** vs the evidence-budget math; picking one sets the composer default (localStorage + session `provider_preference`, sent per-message as today — no new server state).
- Ollama tab: live tags, sizes, quantization; refresh button; “pull hint” copy when a wanted model is absent (`ollama pull qwen3:8b`).
- States: loading skeletons, unreachable provider (with retry), empty-keys (honest copy + env-profile explanation), verify-in-flight (dot breathes — reuse `.dot.composing` animation language).
- A11y: shared `useFocusTrap` (design audit P4), status = dot **and** word (never color alone), `aria-live` verification results, full keyboard path.
- No secret ever round-trips: the form field is `type="password"`, cleared on submit; GETs return fingerprints only.

**Composer/RunningHead integration:** the colophon chip text becomes the *resolved* truth (“Set in claude-sonnet-5 · Anthropic · Work key”); `PROVIDER_KEY_MISSING` errors deep-link the toast action to the Foundry tab for that provider; the insufficient-evidence and error notices keep their existing voice.

---

## 10. Compatibility & migration story

1. **Day-one, zero-config:** env keys seed as active profiles → everything works exactly as before; `DEFAULT_PROVIDER`/`DEFAULT_CLOUD_PROVIDER` still choose the startup default. `*_MODEL` envs become the *initial* default model selection (validated against discovery at boot; invalid → loud warning + fall back to first fitting model — this finally kills the `claude-sonnet-latest` class of drift, G1).
2. **MessageRequest unchanged** (provider enum + model_id string) — the frontend just fills them from discovered lists now. Existing allowlist tests keep passing with a stubbed discovery service.
3. **Gateway keeps working with env keys** during rollout if you keep the one-release fallback; otherwise the seeded-profile path covers it from the first request.
4. Migration 0006 is additive; downgrade drops the table (keys re-derivable from env).

## 11. Edge cases & failure modes (build these as tests)

| Case | Behavior |
|---|---|
| Activate a key that 401s on verify | 409 `KEY_INVALID`, previous active key untouched |
| Activate a 429/unreachable key | activates with warning stamp; generation may still fail → typed error + background re-verify flips status |
| Delete the active key | provider → `no active key`; dot amber; generation → PROVIDER_KEY_MISSING (non-retryable, actionable) |
| Same key bound twice | sha-prefix match → 409 `KEY_ALREADY_BOUND` with the existing profile's name |
| Ollama model vanishes after discovery | gateway exact-match 404 → typed MODEL_NOT_ALLOWED → UI suggests refresh of the model list |
| Key valid at verify, revoked later | generation 401/403 → typed KEY_REJECTED (non-retryable) + background re-verify + UI dot flips on next open |
| Master key rotated/missing | KeyStore fail-closed: key endpoints 503 with the generate-one hint; generation with env-seeded profiles still works only until re-encryption is needed (documented) |
| Two tabs activate different keys | DB partial-unique index serializes; last transaction wins; UI reconciles on refetch |
| Multi-user future | `user_id` column already present; scope queries + ownership checks when auth lands |

## 12. Build phases

- **Phase 1 — backend core (~1 day):** migration 0006 + ORM, KeyStore (+`cryptography` dep, pinned), verifier, keys/models endpoints, env seeding in lifespan (BA7/BA8 ride along), resolution chain + typed errors, redaction negative tests.
- **Phase 2 — gateway (~½ day):** `GET /api/v1/models`, `api_key` payload field + `options.apiKey`, delete env-key lookup + unused `*_MODEL` envs (G6), per-model `maxTokens` (B1), apiKey-on-google/openai live probe. Stretch: `signal` cancellation.
- **Phase 3 — Foundry modal (~1 day):** api.ts client + types, modal shell with focus trap, provider index + dot FLIP, Ollama tab, keys CRUD UX, model picker with fit badges, colophon/composer wiring, toast voice pass, empty/error/loading states.
- **Phase 4 — hardening (~½ day):** rate limiting, dup-key warnings, `docs/` updates (architecture.md key-flow diagram, README required-vars incl. `KEYS_ENCRYPTION_KEY`, ADR for the §3.2 interpretation), security payload tests (key never in: logs, SSE, error bodies, gateway access logs, DB queries output), manual test-plan rows.

Total ≈ 3 days; each phase independently shippable and demo-able. Phase 1+2 already make the backend "truly multi-provider"; Phase 3 is what the user/evaluator *sees*.

## 13. What this unlocks downstream (synergy ledger)

- Harness **B1**: per-model `contextWindow`/`maxTokens` from discovery replace every hardcoded budget → history trimming becomes exact, Ollama `num_ctx` sized from the picked model.
- Harness **G2**: KEY_REJECTED/PROVIDER_KEY_MISSING join the typed-error taxonomy — retryability finally tells the truth on every config failure.
- Design audit **§8.4**: provider dot-travel FLIP gets its real surface (the Foundry spine).
- Backend **BA7/BA8**: shared httpx client + lifespan land naturally as part of Phase 1.
- Spec **§6.2** provider-status endpoint: upgraded from "is env var set" to "is a verified key active + which models are reachable" — the readiness story becomes genuinely operational.
- The evaluator rubric line *"model toggle … document fallback behavior"*: fallback is now "none, by design — explicit typed errors," demoable in one click by deactivating a key.
