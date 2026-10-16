(start_tag
  "<" @open
  ">" @close)

(self_closing_tag
  "<" @open
  "/>" @close)

(end_tag
  "</" @open
  ">" @close)

(expression
  "@(" @open
  ")" @close)

(expression
  "@{" @open
  "}" @close)

(attribute_value
  "\"" @open
  "\"" @close)
