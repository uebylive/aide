import { SyntaxHighlighterProps } from "react-syntax-highlighter";
import { PrismLight as PrismSyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark as dark } from "react-syntax-highlighter/dist/esm/styles/prism";

import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
PrismSyntaxHighlighter.registerLanguage("jsx", jsx);
PrismSyntaxHighlighter.registerLanguage("tsx", tsx);
PrismSyntaxHighlighter.registerLanguage("javascript", javascript);
PrismSyntaxHighlighter.registerLanguage("typescript", typescript);
PrismSyntaxHighlighter.registerLanguage("python", python);
PrismSyntaxHighlighter.registerLanguage("bash", bash);

export const SyntaxHighlighter = ({ children, language, ...props }: SyntaxHighlighterProps) => {
  return (
    <PrismSyntaxHighlighter
      {...props}
      children={String(children).replace(/\n$/, "")}
      style={dark}
      language={language}
      PreTag="div"
    />
  );
};
