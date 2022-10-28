//
// markdown.rs
//
// Copyright (C) 2022 by RStudio, PBC
//
//

use ego_tree::NodeRef;
use scraper::ElementRef;
use scraper::Node;
use scraper::node::Text;

pub struct MarkdownConverter<'a> {
    node: NodeRef<'a, Node>,
    buffer: String,
}

impl<'a> MarkdownConverter<'a> {

    pub fn new(node: NodeRef<'a, Node>) -> Self {
        let buffer = String::new();
        MarkdownConverter { node, buffer }
    }

    pub fn convert(&mut self) -> &str {
        self.convert_node(self.node);
        self.buffer.as_str()
    }

    fn convert_node(&mut self, node: NodeRef<'a, Node>) {
        if node.value().is_element() {
            let element = ElementRef::wrap(node).unwrap();
            self.convert_element(element);
        } else if node.value().is_text() {
            let text = node.value().as_text().unwrap();
            self.convert_text(text);
        }
    }

    fn convert_element(&mut self, element: ElementRef<'a>) {

        match element.value().name() {

            "code" => {
                self.buffer.push('`');
                for child in element.children() {
                    self.convert_node(child);
                }
                self.buffer.push('`');
            }

            "ul" => {
                for child in element.children() {
                    if child.value().is_element() {
                        let child = ElementRef::wrap(child).unwrap();
                        self.buffer.push_str("- ");
                        self.convert_element(child);
                    }
                }
            }

            "ol" => {
                for child in element.children() {
                    if child.value().is_element() {
                        let child = ElementRef::wrap(child).unwrap();
                        self.buffer.push_str("1. ");
                        self.convert_element(child);
                    }
                }
            }

            _ => {
                for child in element.children() {
                    self.convert_node(child);
                }
            }

        }

    }

    fn convert_text(&mut self, text: &Text) {
        self.buffer.push_str(text.to_string().as_str())
    }

}
