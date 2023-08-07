import { messageHandler } from "@estruyf/vscode/dist/client";
import { useState, useEffect } from "react";
import { AntonData } from "../types";

const getOriginalPrompt = (antonData: AntonData) => {
  // Find the first event with eventType === "initialThinking" and return its event_input.
  const initialThinkingEvent = antonData.events.find(
    (event) => event.eventType === "initialThinking"
  );
  return initialThinkingEvent?.eventInput ?? "";
};

// Function to sort AntonData `events` by `execution_event_id` then `event_timestamp`.
// Events with `execution_event_id` `null` should come before events with `execution_event_id` not `null`.
const sortEvents = (antonData: AntonData) => {
  const sortedEvents = [...antonData.events].sort((a, b) => {
    if (a.executionEventId === null && b.executionEventId !== null) {
      return -1;
    } else if (a.executionEventId !== null && b.executionEventId === null) {
      return 1;
    } else if (a.executionEventId === null && b.executionEventId === null) {
      return a.eventTimestamp - b.eventTimestamp;
    } else {
      return parseInt(a.executionEventId as string) - parseInt(b.executionEventId as string);
    }
  });
  return { ...antonData, events: sortedEvents } as AntonData;
};

// Hack: In AntonData `events`, if there are events with the following combination:
// `eventType` = `exploring_node_dfs` and `event_context` = `dfs_start`
// `eventType` = `get_references_for_code_node`
// and both of these events have the same `event_timestamp`, then the `get_references_for_code_node`
// event should come before the `exploring_node_dfs` event.
const fixReferenceLookupOrder = (antonData: AntonData) => {
  const events = [...antonData.events];
  const dfsStartEvents = events.filter(
    (event) => event.eventType === "exploringNodeDfs" && event.eventContext === "dfs_start"
  );
  const referenceLookupEvents = events.filter(
    (event) => event.eventType === "getReferencesForCodeNode"
  );
  const dfsStartEventTimestamps = dfsStartEvents.map((event) => event.eventTimestamp);
  const referenceLookupEventTimestamps = referenceLookupEvents.map(
    (event) => event.eventTimestamp
  );
  const dfsStartEventTimestampsToFix = dfsStartEventTimestamps.filter((timestamp) =>
    referenceLookupEventTimestamps.includes(timestamp)
  );
  dfsStartEventTimestampsToFix.forEach((timestamp) => {
    const dfsStartEventIndex = events.findIndex(
      (event) =>
        event.eventType === "exploringNodeDfs" &&
        event.eventContext === "dfs_start" &&
        event.eventTimestamp === timestamp
    );
    const referenceLookupEventIndex = events.findIndex(
      (event) =>
        event.eventType === "getReferencesForCodeNode" && event.eventTimestamp === timestamp
    );
    if (dfsStartEventIndex !== -1 && referenceLookupEventIndex !== -1) {
      events.splice(dfsStartEventIndex, 1);
      events.splice(referenceLookupEventIndex, 0, antonData.events[dfsStartEventIndex]);
    }
  });
  return { ...antonData, events } as AntonData;
};

// Function to filter AntonData `events` with `eventType` as `exploring_node_dfs`.
// Each of these nodes will have a `event_context` key and a single entry in the `code_symbol_reference` array.
// Return a single event with `eventType` as `exploring_node_dfs` where the `code_symbol_reference` array
// contains all the `code_symbol_reference` from all the `exploring_node_dfs` events. Also add the
// `event_context` into each entry of the `code_symbol_reference` array.
const coalesceNodeExplorationEvets = (antonData: AntonData) => {
  const exploringNodeDfsEvents = antonData.events.filter(
    (event) => event.eventType === "exploringNodeDfs"
  );
  const codeSymbolReference = exploringNodeDfsEvents.reduce(
    (acc, event) => [
      ...(acc ?? []),
      ...(event.codeSymbolReference ?? []).map((e) => ({
        ...e,
        event_context: event.eventContext ?? "",
      })),
    ],
    [] as AntonData["events"][0]["codeSymbolReference"]
  );

  return {
    ...exploringNodeDfsEvents[0],
    eventType: "getReferencesForCodeNode",
    code_symbol_reference: codeSymbolReference,
  } as AntonData["events"][0];
};

const processAntonData = (antonData: AntonData): AntonData => {
  const filteredEvents = antonData.events.filter(
    (event) =>
      event.eventType !== "getReferencesForCodeNode" && event.eventType !== "initialThinking"
  );
  const coalescedNodeExplorationEvent = coalesceNodeExplorationEvets({
    ...antonData,
    events: filteredEvents,
  });
  const filteredData = { ...antonData, events: [...filteredEvents, coalescedNodeExplorationEvent] };
  const sortedData = sortEvents(filteredData);
  const fixedData = fixReferenceLookupOrder(sortedData);
  return fixedData;
};

export const useAntonData = (prompt: string) => {
  const [originalPrompt, setOriginalPrompt] = useState<string>("");
  const [antonData, setAntonData] = useState<AntonData | undefined>();
  console.log(prompt);

  useEffect(() => {
    if (!prompt) return;

    console.log("Sending message to the extension");
    let interval: NodeJS.Timeout;

    messageHandler.send("sendPrompt", {
      prompt,
    });

    setOriginalPrompt(prompt);

    // messageHandler
    //   .request<any>("readData")
    //   .then((data: AntonData) => {
    //     console.log("Received data from the extension", data);
    //     setOriginalPrompt(getOriginalPrompt(data));
    //     const sortedData = processAntonData(data);
    //     // Set interval and timeout to simulate loading. Remove this in production.
    //     // Load the events one at a time, with a random delay between 1 and 5 seconds.
    //     // This is to simulate the loading of events in the UI.
    //     interval = setInterval(() => {
    //       const event = sortedData.events.shift();
    //       if (event) {
    //         setAntonData((prevData) => {
    //           return {
    //             saveDestination: prevData?.saveDestination ?? "",
    //             events: [...(prevData?.events ?? []), event],
    //           };
    //         });
    //       }
    //     }, Math.floor(Math.random() * 1000) + 0);
    //   })
    //   .catch((err) => {
    //     console.log("Error while reading data", err);
    //     // If environment is development, load the JSON data from the local file
    //     if (process.env.NODE_ENV === "development") {
    //       import("../mocks/sample_test.json").then((sampleData) => {
    //         console.log("Received data from local file", sampleData);
    //         const data = sampleData.default as unknown as AntonData;
    //         setOriginalPrompt(getOriginalPrompt(data));
    //         const sortedData = processAntonData(data);
    //         // Set interval and timeout to simulate loading. Remove this in production.
    //         // Load the events one at a time, with a random delay between 1 and 5 seconds.
    //         // This is to simulate the loading of events in the UI.
    //         interval = setInterval(() => {
    //           const event = sortedData.events.shift();
    //           if (event) {
    //             setAntonData((prevData) => {
    //               return {
    //                 saveDestination: prevData?.saveDestination ?? "",
    //                 events: [...(prevData?.events ?? []), event],
    //               };
    //             });
    //           }
    //         }, Math.floor(Math.random() * 4000) + 1000);
    //       });
    //     }
    //   });

    // return () => {
    //   clearInterval(interval);
    // };
  }, [prompt]);

  return { antonData, originalPrompt };
};
