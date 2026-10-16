; Policy structure: sections and policies, skipping leaf value/content nodes.
(element
  [
    (start_tag
      (tag_name) @name)
    (self_closing_tag
      (tag_name) @name)
  ]
  (#not-any-of? @name "value" "set-url" "set-method")) @item
