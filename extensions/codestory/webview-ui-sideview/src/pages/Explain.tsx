import remarkGfm from "remark-gfm";
import { ReactMarkdown } from "react-markdown/lib/react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import { useExplanationStore } from "../store";

export const Explain = () => {
  const { explanationData } = useExplanationStore();
  console.log("Whats the explanation data");
  console.log(explanationData);

  return (
    <div className="mt-2 mb-12 mx-6 h-full text-vscode-sideBar-foreground">
      {!explanationData ? (
        <div className="h-full flex flex-col items-center justify-center">
          <p className="text-center">
            Try clicking the hovering 'Explain' buttons within your code?
          </p>
        </div>
      ) : (
        <div className="rounded-lg mb-4 border border-vscode-foreground overflow-x-hidden">
          <p className="p-3 font-bold bg-vscode-sideBar-background">{explanationData.name}</p>
          {!explanationData.explanation.startsWith("No explanation found") &&
            explanationData.documentPath && (
              <>
                <hr className="border-vscode-foreground px-1" />
                <p className="p-3">{explanationData.documentPath}</p>
              </>
            )}
          <hr className="border-vscode-foreground px-1" />
          <ReactMarkdown
            children={explanationData.explanation}
            className="p-3 bg-vscode-input-background overflow-x-hidden"
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                return !inline && match ? (
                  // @ts-ignore
                  <SyntaxHighlighter
                    {...props}
                    children={String(children).replace(/\n$/, "")}
                    language={match[1]}
                    PreTag="div"
                  />
                ) : (
                  <code {...props} className={className}>
                    {children}
                  </code>
                );
              },
            }}
          />
        </div>
      )}
    </div>
  );
};
