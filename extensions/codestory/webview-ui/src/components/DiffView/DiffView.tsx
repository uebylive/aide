import ReactDiffViewer from "react-diff-viewer-continued";

type GitDiffProps = {
  gitDiff: string;
  className?: string;
};

export const DiffView = ({ gitDiff, className }: GitDiffProps) => {
  // Extract the ORIGINAL and UPDATED parts
  const parts = gitDiff.split("====");
  console.log("[DiffView] gitdiff: ", gitDiff);
  const original = parts[0]
    .replace("<<<< ORIGINAL\n", "")
    .replace("```\n", "")
    .replace(/^\n|\n$/g, "");
  const updated = parts[1].replace(">>>> UPDATED\n```\n", "").replace(/^\n|\n$/g, "");

  return (
    <div className={`${className} border p-4 bg-cs-bgPrimary`}>
      <ReactDiffViewer oldValue={original} newValue={updated} splitView={false} hideLineNumbers />
    </div>
  );
};
