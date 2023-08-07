import { IconPlant, IconLeaf, IconChevronRight, IconCornerDownRight } from "@tabler/icons-react";

import { Card } from "./components/Card/Card";
import { Markdown } from "./components/Markdown/Markdown";
import { AntonEvent, Codesymbolreference } from "./types";
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

const convertDFSEventToTree = (references: Codesymbolreference[]) => {
  let stack: DFSTree[] = [];

  references.forEach((reference) => {
    let node = { node: reference.name, children: [] };

    if (reference.event_context === "dfs_start") {
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
    } else if (reference.event_context === "dfs_end") {
      if (stack.length > 1) {
        stack.pop();
      }
    }
  });

  return stack[0];
};

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
    switch (data.event_type) {
      case "initial_thinking":
        return <Markdown className="p-4" children={data.event_context ?? ""} />;
      case "planning_out":
        return <Markdown className="p-4" children={data.event_context ?? ""} />;
      case "search_for_code_snippets":
        return <Markdown className="p-4" children={data.event_input ?? ""} />;
      case "search_results":
        return (
          <div className="flex flex-col break-words p-4 gap-1">
            {(data.code_symbol_reference ?? []).slice(0, 5).map((result, i) => {
              return (
                <div key={i}>
                  <details>
                    <summary className="cursor-pointer">
                      <p className="inline text-sm font-bold">
                        {result.name.split(".").pop()}
                        <span className="inline-block text-xs font-normal ml-2 text-cs-textSecondary">
                          {result.code_location.path}
                        </span>
                      </p>
                    </summary>
                    <Markdown
                      className="py-4"
                      children={`\`\`\`${result.code_location.file_name.split(".").pop()}\n${
                        (result.function_information ?? result.class_information).raw_code
                      }\n\`\`\``}
                    />
                  </details>
                </div>
              );
            })}
          </div>
        );
      case "branch_elements":
        return (
          <div className="w-full inline-flex overflow-x-scroll no-scrollbar snap-x snap-mandatory scroll-smooth rounded-box">
            {(data.code_modification_instruction_list ?? []).map((_, i) => (
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
      case "code_symbol_modification_instruction":
        return (
          <div className="p-4">
            <Breadcrumbs
              path={data.code_symbol_modification_instruction?.code_symbol_name.split(".") ?? []}
            />
            <Markdown children={data.code_symbol_modification_instruction?.instructions ?? ""} />
          </div>
        );
      case "code_symbol_modification_event":
        return (
          <div className="p-4">
            <Markdown children={data.code_modification_context_and_diff?.code_modification ?? ""} />
            <DiffView
              className="pt-4"
              gitDiff={data.code_modification_context_and_diff?.code_diff ?? ""}
            />
          </div>
        );
      case "save_file":
        return (
          <Markdown
            className="p-4"
            children={`Updating \`${data.file_save_event?.code_symbol_name
              .split(".")
              .pop()}\` in \`${data.file_save_event?.file_path ?? ""}\`.`}
          />
        );
      case "test_execution_harness":
        return (
          <Markdown
            className="p-4"
            children={data.test_execution_harness?.plan_for_test_script_generation ?? ""}
          />
        );
      case "terminal_execution":
        return (
          <div>
            <Terminal
              children={`\`\`\`sh\n\n> ${data.args?.join(" ")}\n\n${data.stdout}\n\`\`\``}
            />
          </div>
        );
      case "execution_branch_finish_reason":
        return (
          <div className="p-4">
            Exploration {data.execution_event_id ? data.execution_event_id + 1 : ""} ended with `
            {data.execution_branch_finish_reason}`
          </div>
        );
      case "get_references_for_code_node":
        return (
          <div className="p-4">
            <Tree data={convertDFSEventToTree(data.code_symbol_reference ?? [])} />
          </div>
        );
      case "exploring_node_dfs":
        return (
          <div className="p-4">
            {data.event_context === "dfs_start" ? (
              <Markdown children={`Exploring \`${data.code_symbol_reference?.[0].name}\``} />
            ) : (
              <Markdown children={`Done exploring \`${data.code_symbol_reference?.[0].name}\``} />
            )}
          </div>
        );
      case "plan_changes_for_node":
        return (
          <div className="p-4">
            <Markdown
              children={`${data.plan_changes_for_node?.current_node_changes.join("\n- ")}` ?? ""}
            />
          </div>
        );
      case "lookup_code_snippets_for_symbols":
        return (
          <div className="p-4">
            <Breadcrumbs path={data.code_symbol_name?.split(".") ?? []} />
            <Markdown
              className="pt-4"
              children={`Finding \`${data.code_symbol_name?.split(".").pop()}\`\n\`\`\`py${
                data.lookup_code_snippet_for_symbols?.current_code_node.function_information
                  .raw_code ??
                data.lookup_code_snippet_for_symbols?.current_code_node.class_information.raw_code
              }\`\`\``}
            />
          </div>
        );
      case "changes_to_current_node_on_dfs":
        return (
          <div className="p-4">
            <p className="text-lg font-bold">Making changes</p>
            <DiffView
              className="my-4"
              gitDiff={data.changes_to_current_node_on_dfs?.code_generation ?? ""}
            />
            <p className="text-lg font-bold pb-2">Next steps</p>
            <Markdown
              children={`- ${data.changes_to_current_node_on_dfs?.next_steps
                .filter((step) => step)
                .join("\n- ")}`}
            />
          </div>
        );
      case "task_complete":
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
    "initial_thinking",
    "planning_out",
    "search_for_code_snippets",
    "search_results",
  ].includes(data.event_type);

  return (
    <>
      {!isFirst && <div className="border-l h-8 ml-12" />}
      <Card
        eventType={data.event_type}
        cardContext={
          isExplorationCard ? `EXPLORATION ${exploration + 1}` : `“${originalPrompt.trim()}”`
        }
        timestamp={data.event_timestamp}
        key={data.event_id}>
        {renderCardContents()}
      </Card>
    </>
  );
};
