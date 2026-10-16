((csharp_code) @injection.content
  (#set! injection.language "APIM Expression"))

; Literal JSON bodies, e.g. <set-body>{"error":"..."}</set-body>. Only when the
; whole text node is a JSON object/array, so Liquid templates and bodies mixing
; in {{named-values}} are left alone.
(element
  (start_tag
    (tag_name) @_tag)
  (text) @injection.content
  (#any-of? @_tag "set-body" "mock-response" "value")
  (#match? @injection.content "^\\s*[\\[{](.|\\n)*[\\]}]\\s*$")
  (#set! injection.language "json"))
