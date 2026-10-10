"""
HTML and Artifact Sanitization & Isolation Service (Codename: Kestrel)
Implements IMPLEMENTATION_SPEC.md §9.1 and §9.2 security contracts.
"""

from __future__ import annotations

import re

import nh3

# Strict Content-Security-Policy mandated by IMPLEMENTATION_SPEC.md §9.1
CSP_PREVIEW_POLICY = (
    "default-src 'none'; "
    "img-src data: blob:; "
    "font-src data:; "
    "style-src 'unsafe-inline'; "
    "script-src 'none'; "
    "connect-src 'none'; "
    "frame-src 'none'; "
    "object-src 'none'; "
    "media-src 'none'; "
    "form-action 'none'; "
    "base-uri 'none';"
)

# Safe HTML tags allowed in rendered artifacts (strictly no script, form, iframe, embed)
ALLOWED_TAGS: set[str] = {
    "a",
    "abbr",
    "article",
    "aside",
    "b",
    "bdi",
    "bdo",
    "blockquote",
    "br",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "dfn",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "i",
    "img",
    "ins",
    "kbd",
    "li",
    "mark",
    "nav",
    "ol",
    "p",
    "pre",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "u",
    "ul",
    "var",
    "wbr",
}

# Generic attributes safe on any tag
GLOBAL_SAFE_ATTRIBUTES: set[str] = {
    "class",
    "id",
    "style",
    "title",
    "dir",
    "lang",
    "role",
    "aria-label",
    "aria-hidden",
    "aria-describedby",
}

# Tag-specific attribute allowlist (Note: 'rel' is omitted from 'a' because nh3 manages it via link_rel)
TAG_SPECIFIC_ATTRIBUTES: dict[str, set[str]] = {
    "a": {"href", "title", "target", *GLOBAL_SAFE_ATTRIBUTES},
    "img": {"src", "alt", "width", "height", "loading", *GLOBAL_SAFE_ATTRIBUTES},
    "td": {"colspan", "rowspan", "align", "valign", *GLOBAL_SAFE_ATTRIBUTES},
    "th": {"colspan", "rowspan", "align", "valign", "scope", *GLOBAL_SAFE_ATTRIBUTES},
    "col": {"span", "width", *GLOBAL_SAFE_ATTRIBUTES},
    "colgroup": {"span", "width", *GLOBAL_SAFE_ATTRIBUTES},
    "table": {"border", "cellpadding", "cellspacing", *GLOBAL_SAFE_ATTRIBUTES},
}

ALLOWED_URL_SCHEMES: set[str] = {"http", "https", "mailto", "data", "blob"}

# Regex patterns for dangerous CSS features
_CSS_IMPORT_RE = re.compile(r"@import\s+[^;]+;?", flags=re.IGNORECASE)
_CSS_EXTERNAL_URL_RE = re.compile(
    r"url\s*\(\s*['\"]?(https?:|//)[^'\")]*['\"]?\s*\)", flags=re.IGNORECASE
)
_CSS_EXPRESSION_RE = re.compile(r"expression\s*\([^)]*\)", flags=re.IGNORECASE)
_CSS_BEHAVIOR_RE = re.compile(r"behavior\s*:[^;]+;?", flags=re.IGNORECASE)
_STYLE_TAG_RE = re.compile(
    r"<style\b[^>]*>(.*?)</style>", flags=re.IGNORECASE | re.DOTALL
)
_BODY_TAG_RE = re.compile(r"<body\b[^>]*>(.*?)</body>", flags=re.IGNORECASE | re.DOTALL)


def sanitize_css(raw_css: str) -> str:
    """
    Sanitize inline stylesheet content.
    Strips @import directives, external url(...) calls (preventing exfiltration / tracking),
    IE expressions, and behaviors.
    """
    if not raw_css:
        return ""
    css = _CSS_IMPORT_RE.sub("/* stripped-import */", raw_css)
    css = _CSS_EXTERNAL_URL_RE.sub("none", css)
    css = _CSS_EXPRESSION_RE.sub("none", css)
    css = _CSS_BEHAVIOR_RE.sub("", css)
    return css.strip()


def sanitize_html(raw_html: str) -> str:
    """
    Clean untrusted HTML using nh3 Rust-based sanitizer with strict allowlists.
    Removes active scripting, event handlers (onload, onerror), forms, iframes,
    and javascript: URLs. Enforces noopener noreferrer on links.
    """
    if not raw_html:
        return ""

    # Build attribute allowlist dict for nh3
    tag_attribute_values = {}
    for tag in ALLOWED_TAGS:
        tag_attribute_values[tag] = TAG_SPECIFIC_ATTRIBUTES.get(
            tag, GLOBAL_SAFE_ATTRIBUTES
        )

    cleaned = nh3.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=tag_attribute_values,
        url_schemes=ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer",
    )
    return cleaned


def build_sandboxed_preview_html(
    raw_content: str, title: str = "Artifact Preview"
) -> str:
    """
    Construct a complete, hermetic, sandboxed HTML document ready for rendering
    inside an <iframe sandbox="">.
    Injects mandatory Content-Security-Policy header tag, sanitized styles,
    and sanitized DOM body.
    """
    if not raw_content:
        raw_content = ""

    # 1. Extract and sanitize any <style> blocks
    style_blocks: list[str] = []
    for match in _STYLE_TAG_RE.finditer(raw_content):
        style_content = match.group(1)
        sanitized_style = sanitize_css(style_content)
        if sanitized_style:
            style_blocks.append(sanitized_style)

    combined_css = "\n".join(style_blocks)

    # 2. Extract body if full document passed, or use entire content
    body_match = _BODY_TAG_RE.search(raw_content)
    if body_match:
        content_to_clean = body_match.group(1)
    else:
        # Strip any existing <style> tags so they don't leak into body text
        content_to_clean = _STYLE_TAG_RE.sub("", raw_content)

    sanitized_body = sanitize_html(content_to_clean)

    # 3. Assemble isolated preview document with CSP
    html_document = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="{CSP_PREVIEW_POLICY}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{nh3.clean_text(title)}</title>
  <style>
    :root {{
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }}
    body {{
      margin: 0;
      padding: 1.5rem;
      background: transparent;
      color: inherit;
    }}
    pre, code {{
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    }}
    table {{
      border-collapse: collapse;
      width: 100%;
    }}
    th, td {{
      border: 1px solid currentColor;
      padding: 0.5rem;
      text-align: left;
    }}
    {combined_css}
  </style>
</head>
<body>
{sanitized_body}
</body>
</html>"""
    return html_document
