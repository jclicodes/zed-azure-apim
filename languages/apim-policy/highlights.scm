(comment) @comment

(processing_instruction) @preproc

(tag_name) @tag

; Policy document structure.
((tag_name) @keyword
  (#any-of? @keyword "policies" "inbound" "backend" "outbound" "on-error" "fragment" "base"))

; Control flow.
((tag_name) @keyword.control
  (#any-of? @keyword.control "choose" "when" "otherwise" "retry" "return-response" "include-fragment" "wait" "limit-concurrency"))

(attribute_name) @attribute

(attribute_value) @string

(named_value) @variable.special

(entity) @string.escape

(expression
  [
    "@("
    ")"
    "@{"
    "}"
  ] @punctuation.special)

(csharp_code) @embedded

(cdata
  [
    "<![CDATA["
    "]]>"
  ] @punctuation.special)

[
  "<"
  ">"
  "</"
  "/>"
] @punctuation.bracket

"=" @punctuation.delimiter
