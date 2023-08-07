import { useState } from "react";

import { DataEvent } from "./DataEvent";
import { useAntonData } from "./hooks/useAntonData";
import { useExplorationContext } from "./context";
import { ReactComponent as AideLogo } from "./assets/aide-logo.svg";
import { ReactComponent as CSLogo } from "./assets/cs-logomark.svg";

function App() {
  const [prompt, setPrompt] = useState("");
  const [promptForSubmission, setPromptForSubmission] = useState("");
  const { exploration } = useExplorationContext();
  const { antonData, originalPrompt } = useAntonData(promptForSubmission);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      setPromptForSubmission(prompt);
      e.preventDefault();
    }
  };

  return (
    <main className="bg-cs-bgPrimary min-h-screen">
      <div className="flex flex-col items-center justify-center gap-1 py-16">
        {/* <AideLogo className="text-cs-textPrimary h-24 md:h-36" />
        <p>by</p> */}
        <div className="flex items-center">
          <CSLogo className="h-16 md:h-24" />
          <p className="text-2xl md:text-4xl font-bold">CodeStory</p>
        </div>
      </div>
      <div className="container max-w-screen-lg mx-auto px-5 pb-16">
        <div className="mb-16">
          <p className="mb-2">Go on, ask me something.</p>
          <form onSubmit={() => setPromptForSubmission(prompt)}>
            <textarea
              placeholder="What can I help you accomplish today?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-32 w-full p-2 rounded border border-cs-textSecondary bg-cs-bgSecondary"
            />
          </form>
        </div>
        <div className="flex flex-col">
          {antonData && antonData.events.length > 0
            ? antonData.events
                .filter(
                  (ev) =>
                    ev.event_type !== "initial_thinking" &&
                    (!ev.execution_event_id || ev.execution_event_id === exploration)
                )
                .map((e, i) => {
                  return (
                    <div key={e.event_id}>
                      <DataEvent originalPrompt={originalPrompt} data={e} isFirst={i === 0} />
                    </div>
                  );
                })
            : promptForSubmission && (
                <div className="flex items-center justify-center text-cs-textSecondary">
                  <div
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
                    role="status"
                  />
                  <p className="pl-2 text-lg font-bold">Getting to work</p>
                </div>
              )}
        </div>
      </div>
    </main>
  );
}

export default App;
