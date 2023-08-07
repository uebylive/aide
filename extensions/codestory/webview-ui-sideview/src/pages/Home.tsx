import DOMPurify from "dompurify";
import { messageHandler } from "@estruyf/vscode/dist/client";
import { RefObject, useEffect, useRef, useState } from "react";
import { VSCodeProgressRing, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";

import { TimeLine } from "./Timeline";
import { PageType, SearchCompletion, SearchResponse } from "../types";
import { handleOpenFile } from "../utils/files";

interface HomeProps {
  setPage: (page: PageType) => void;
}

export const Home = ({ setPage }: HomeProps) => {
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchCompletion[]>([]);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleSearch = () => {
      setIsSearching(true);
      console.log("searching for", searchText);
      messageHandler.request<SearchResponse>("search", { prompt: searchText }).then((data) => {
        const { results } = data;
        console.log(results);
        setSearchResults(results);
        setIsSearching(false);
      });
    };

    const ref = searchInputRef as RefObject<HTMLTextAreaElement>;
    let keyboardListener: (event: KeyboardEvent) => void;

    if (ref.current) {
      ref.current.focus();
      keyboardListener = (event: KeyboardEvent) => {
        if (event.code === "Enter" || event.code === "NumpadEnter") {
          event.preventDefault();
          handleSearch();
        }
      };
      ref.current.addEventListener("keydown", keyboardListener);
    }
    return () => {
      ref.current?.removeEventListener("keydown", keyboardListener);
    };
  }, [searchText]);

  const handleSearchInput = (e: Event | React.FormEvent<HTMLElement>) => {
    const ev = e as React.ChangeEvent<HTMLInputElement>;
    const newText = ev.target.value;
    setSearchText(newText);
    if (newText.length === 0) {
      setIsSearching(false);
      setPage("home");
    } else {
      setPage("search");
    }
  };

  return (
    <div className="min-h-full w-full flex flex-col p-4">
      {/* @ts-ignore */}
      <VSCodeTextArea
        autofocus
        className="w-full"
        value={searchText}
        onInput={handleSearchInput}
        placeholder="Search for a function or class by describing it"
        ref={searchInputRef}
      />
      <hr className="my-6 border-vscode-foreground" />
      {searchText.length > 0 ? (
        <>
          {isSearching && searchResults.length === 0 ? (
            <div className="w-full flex align-middle justify-center mt-24">
              {/* @ts-ignore */}
              <VSCodeProgressRing />
            </div>
          ) : (
            <>
              {searchResults.map((result) => (
                <div
                  className="rounded-lg mb-4 border border-vscode-foreground overflow-x-hidden cursor-pointer transition ease-in-out hover:-translate-y-1 hover:scale-[1.02] duration-300"
                  onClick={() => handleOpenFile(result.filePath, result.lineStart)}>
                  <p className="p-3 font-bold bg-vscode-sideBar-background">{result.filePath}</p>
                  <hr className="border-vscode-foreground px-1" />
                  <div
                    className="bg-vscode-input-background overflow-x-hidden font-mono htmlcode"
                    style={{ "--linestart": result.lineStart } as React.CSSProperties}
                    dangerouslySetInnerHTML={{
                      // @ts-ignore
                      __html: DOMPurify.sanitize(result.matchedCode, {
                        RETURN_TRUSTED_TYPE: true,
                      }),
                    }}
                  />
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <TimeLine />
      )}
    </div>
  );
};
