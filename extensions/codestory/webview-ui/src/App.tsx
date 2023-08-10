import { useEffect, useState } from "react";

import { DataEvent } from "./DataEvent";
import { useAntonData } from "./hooks/useAntonData";
import { useExplorationContext } from "./context";
import { ReactComponent as AideLogo } from "./assets/aide-logo.svg";
import { ReactComponent as CSLogo } from "./assets/cs-logomark.svg";
import { EventData } from "@estruyf/vscode";
import { Messenger } from "@estruyf/vscode/dist/client";
import { useChangedAntonDataStore } from "./store";

function App() {
  const [prompt, setPrompt] = useState("");
  const [promptForSubmission, setPromptForSubmission] = useState("");
  const { exploration } = useExplorationContext();
  const { setAntonData, antonData } = useChangedAntonDataStore();
  const { originalPrompt } = useAntonData(promptForSubmission);

  useEffect(() => {
    const listener = (message: MessageEvent<EventData<unknown>>) => {
      console.log("[debugging] What is the message", message);
      const { command, payload } = message.data;
      if (command === "sendPrompt") {
        console.log("Whats the payload");
        console.log(payload);
        console.log("We are done");
        setAntonData(payload as any);
        console.log("are we done here");
      }
    };

    console.log("Listening to messages");
    Messenger.listen(listener);

    return () => {
      console.log("Unregistering listener...");
      Messenger.unlisten(listener);
    }
  }, []);

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
                    ev.eventType !== "initialThinking" &&
                    (!ev.executionEventId || ev.executionEventId === exploration.toString())
                )
                .map((e, i) => {
                  return (
                    <div key={e.eventId}>
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
