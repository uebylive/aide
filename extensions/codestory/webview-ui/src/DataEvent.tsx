import { IconPlant, IconLeaf, IconChevronRight, IconCornerDownRight } from "@tabler/icons-react";

import { Card } from "./components/Card/Card";
import { Markdown } from "./components/Markdown/Markdown";
import { AntonEvent, CodeSymbolInformation } from "./types";
import { Terminal } from "./components/Terminal/Terminal";
import { DiffView } from "./components/DiffView/DiffView";
import { useExplorationContext } from "./context";
import { Breadcrumbs } from "./components/Breadcrumbs/Breadcrumbs";

type DataEventProps = {
  data: AntonEvent;
  originalPrompt: string;
  isFirst: boolean;
};

type DFSTree = {
  node: string;
  children: DFSTree[];
};

// const convertDFSEventToTree = (references: CodeSymbolReference[]) => {
//   let stack: DFSTree[] = [];

//   references.forEach((reference) => {
//     let node = { node: reference.name, children: [] };

//     if (reference.event_context === "dfs_start") {
//       if (stack.length > 0) {
//         stack[stack.length - 1].children.push(node);
//       }
//       stack.push(node);
//     } else if (reference.event_context === "dfs_end") {
//       if (stack.length > 1) {
//         stack.pop();
//       }
//     }
//   });

//   return stack[0];
// };

const TreeNode = ({ node }: { node: DFSTree }) => {
  return (
    <div>
      <h3>{node.node}</h3>
      {node.children.map((child, index) => (
        <div className="flex">
          <IconCornerDownRight />
          <TreeNode key={index} node={child} />
        </div>
      ))}
    </div>
  );
};

const Tree = ({ data }: { data: DFSTree }) => {
  return <TreeNode node={data} />;
};

export const DataEvent = ({ data, originalPrompt, isFirst }: DataEventProps) => {
  const { exploration, setExploration } = useExplorationContext();

  const renderCardContents = () => {
    switch (data.eventType) {
      case "initialThinking":
        return <Markdown className="p-4" children={data.eventContext ?? ""} />;
      case "planningOut":
        return <Markdown className="p-4" children={data.eventContext ?? ""} />;
      case "searchForCodeSnippets":
        return <Markdown className="p-4" children={data.eventInput ?? ""} />;
      case "searchResults":
        return (
          <div className="flex flex-col break-words p-4 gap-1">
            {(data.codeSymbolReference ?? []).slice(0, 5).map((result, i) => {
              return (
                <div key={i}>
                  <details>
                    <summary className="cursor-pointer">
                      <p className="inline text-sm font-bold">
                        {result.symbolName.split(".").pop()}
                        <span className="inline-block text-xs font-normal ml-2 text-cs-textSecondary">
                          {result.fsFilePath}
                        </span>
                      </p>
                    </summary>
                    <Markdown
                      className="py-4"
                      children={`\`\`\`${result.fsFilePath.split(".").pop()}\n${
                        result.codeSnippet.code
                      }\n\`\`\``}
                    />
                  </details>
                </div>
              );
            })}
          </div>
        );
      case "branchElements":
        return (
          <div className="w-full inline-flex overflow-x-scroll no-scrollbar snap-x snap-mandatory scroll-smooth rounded-box">
            {(data.codeModificationInstructionList ?? []).map((_, i) => (
              <div key={i} className="box-content flex flex-none snap-center">
                <div
                  className={`py-8 px-32 border cursor-pointer ${
                    exploration === i ? "text-cs-textPrimary" : "text-cs-textSecondary"
                  } hover:text-cs-textPrimary ${exploration === i ? "font-bold" : ""}`}
                  onClick={() => setExploration(i)}>
                  <p>Exploration {i + 1}</p>
                </div>
              </div>
            ))}
          </div>
        );
      case "codeSymbolModificationInstruction":
        return (
          <div className="p-4">
            <Breadcrumbs
              path={data.codeSymbolModificationInstruction?.codeSymbolName.split(".") ?? []}
            />
            <Markdown children={data.codeSymbolModificationInstruction?.instructions ?? ""} />
          </div>
        );
      case "codeSymbolModificationEvent":
        return (
          <div className="p-4">
            <Markdown children={data.codeModificationContextAndDiff?.codeModification ?? ""} />
            <DiffView
              className="pt-4"
              gitDiff={data.codeModificationContextAndDiff?.codeDiff ?? ""}
            />
          </div>
        );
      case "saveFile":
        return (
          <Markdown
            className="p-4"
            children={`Updating \`${data.fileSaveEvent?.codeSymbolName
              .split(".")
              .pop()}\` in \`${data.fileSaveEvent?.filePath ?? ""}\`.`}
          />
        );
      case "testExecutionHarness":
        return (
          <Markdown
            className="p-4"
            children={data.testExecutionHarness?.planForTestScriptGeneration ?? ""}
          />
        );
      case "terminalExecution":
        return (
          <div>
            <Terminal
              children={`\`\`\`sh\n\n> ${data.args?.join(" ")}\n\n${data.stdout}\n\`\`\``}
            />
          </div>
        );
      case "executionBranchFinishReason":
        return (
          <div className="p-4">
            Exploration {data.executionEventId ? data.executionEventId + 1 : ""} ended with `
            {data.executionBranchFinishReason}`
          </div>
        );
      // case "get_references_for_code_node":
      //   return (
      //     <div className="p-4">
      //       <Tree data={convertDFSEventToTree(data.codeSymbolReference ?? [])} />
      //     </div>
      //   );
      // case "exploring_node_dfs":
      //   return (
      //     <div className="p-4">
      //       {data.eventContext === "dfs_start" ? (
      //         <Markdown children={`Exploring \`${data.codeSymbolReference?.[0].name}\``} />
      //       ) : (
      //         <Markdown children={`Done exploring \`${data.codeSymbolReference?.[0].name}\``} />
      //       )}
      //     </div>
      //   );
      // case "plan_changes_for_node":
      //   return (
      //     <div className="p-4">
      //       <Markdown
      //         children={`${data.plan_changes_for_node?.current_node_changes.join("\n- ")}` ?? ""}
      //       />
      //     </div>
      //   );
      // case "lookup_code_snippets_for_symbols":
      //   return (
      //     <div className="p-4">
      //       <Breadcrumbs path={data.code_symbol_name?.split(".") ?? []} />
      //       <Markdown
      //         className="pt-4"
      //         children={`Finding \`${data.code_symbol_name?.split(".").pop()}\`\n\`\`\`py${
      //           data.lookup_code_snippet_for_symbols?.current_code_node.function_information
      //             .raw_code ??
      //           data.lookup_code_snippet_for_symbols?.current_code_node.class_information.raw_code
      //         }\`\`\``}
      //       />
      //     </div>
      //   );
      // case "changes_to_current_node_on_dfs":
      //   return (
      //     <div className="p-4">
      //       <p className="text-lg font-bold">Making changes</p>
      //       <DiffView
      //         className="my-4"
      //         gitDiff={data.changes_to_current_node_on_dfs?.code_generation ?? ""}
      //       />
      //       <p className="text-lg font-bold pb-2">Next steps</p>
      //       <Markdown
      //         children={`- ${data.changes_to_current_node_on_dfs?.next_steps
      //           .filter((step) => step)
      //           .join("\n- ")}`}
      //       />
      //     </div>
      //   );
      case "taskComplete":
        return (
          <div className="p-4">
            <p>I'm done! Please review the changes 🚀</p>
          </div>
        );
      default:
        return <p>Unable to fetch data.</p>;
    }
  };

  const isExplorationCard = ![
    "initialThinking",
    "planningOut",
    "searchForCodeSnippets",
    "searchResults",
  ].includes(data.eventType);

  return (
    <>
      {!isFirst && <div className="border-l h-8 ml-12" />}
      <Card
        eventType={data.eventType}
        cardContext={
          isExplorationCard ? `EXPLORATION ${exploration + 1}` : `“${originalPrompt.trim()}”`
        }
        timestamp={data.eventTimestamp / 1000.0}
        key={data.eventId}>
        {renderCardContents()}
      </Card>
    </>
  );
};
