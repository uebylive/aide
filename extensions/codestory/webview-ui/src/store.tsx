import { create } from "zustand";
import { AntonData, AntonDataResponse } from "./types";

export const useChangedAntonDataStore = create<AntonDataResponse>((set) => ({
    antonData: {
        events: [],
        saveDestination: "",
    },
    setAntonData: (newAntonData: AntonData) =>
        set({ antonData: newAntonData }),
}));