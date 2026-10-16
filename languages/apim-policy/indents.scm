(element
  (start_tag)
  (end_tag) @end) @indent

(start_tag
  ">" @end) @indent

(self_closing_tag
  "/>" @end) @indent

(expression
  "@{"
  "}" @end) @indent
