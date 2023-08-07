export type EventType =
  | "initialThinking"
  | "planningOut"
  | "searchForCodeSnippets"
  | "searchResults"
  | "branchElements"
  | "codeSymbolModificationInstruction"
  | "codeSymbolModificationEvent"
  | "saveFile"
  | "testExecutionHarness"
  | "terminalExecution"
  | "executionBranchFinishReason"
  | "getReferencesForCodeNode"
  | "exploringNodeDfs"
  | "taskComplete";

export interface AntonData {
  events: AntonEvent[];
  saveDestination: string;
}


export type AntonDataResponse = {
  antonData: AntonData;
  setAntonData: (newAntonData: AntonData) => void;
}

// This is a direct copy of SymbolKind, we are using it to keep things free
// of vscode dependencies
export enum CodeSymbolKind {
  file = 0,
  module = 1,
  namespace = 2,
  package = 3,
  class = 4,
  method = 5,
  property = 6,
  field = 7,
  constructor = 8,
  enum = 9,
  interface = 10,
  function = 11,
  variable = 12,
  constant = 13,
  string = 14,
  number = 15,
  boolean = 16,
  array = 17,
  object = 18,
  key = 19,
  null = 20,
  enumMember = 21,
  struct = 22,
  event = 23,
  operator = 24,
  typeParameter = 25
}

export interface CodeSymbolInformation {
  symbolName: string,
  symbolKind: CodeSymbolKind,
  symbolStartLine: number,
  symbolEndLine: number,
  codeSnippet:
  { languageId: string; code: string },
  extraSymbolHint: string | null,
  dependencies: CodeSymbolDependencies[],
  fsFilePath: string,
  originalFilePath: string,
  workingDirectory: string,
  displayName: string,
  originalName: string,
  originalSymbolName: string,
  globalScope: string,
}

export interface FileCodeSymbolInformation {
  workingDirectory: string,
  filePath: string,
  codeSymbols: CodeSymbolInformation[],
}


export interface CodeSymbolDependencies {
  codeSymbolName: string,
  codeSymbolKind: CodeSymbolKind,
  // The edges here are to the code symbol node in our graph
  edges: CodeSymbolDependencyWithFileInformation[],
}

export interface CodeSymbolDependencyWithFileInformation {
  codeSymbolName: string,
  filePath: string,
}

export interface CodeSymbolInformationEmbeddings {
  codeSymbolInformation: CodeSymbolInformation,
  codeSymbolEmbedding: number[],
}

export interface AntonEvent {
  eventId: string;
  eventType: EventType;
  eventContext: string | null;
  eventInput: string;
  eventOutput: string | null;
  eventTimestamp: number;
  codeSymbolReference: CodeSymbolInformation[] | null;
  stdout: string | null;
  stderr: string | null;
  codeSymbolName: string | null;
  codeSymbolModificationInstruction: CodeSymbolModificationInstruction | null;
  codeModificationContextAndDiff: CodeModificationContextAndDiff | null;
  fileSaveEvent: FileSaveEvent | null;
  executionEventId: string | null;
  testExecutionHarness: TestExecutionHarness | null;
  exitCode: number | null;
  args: string[] | null;
  markdownReferences: Record<string, CodeSymbolInformation> | null;
  numberOfBranchElements: number | null;
  executionBranchFinishReason: string | null;
  codeModificationInstructionList: CodeSymbolModificationInstruction[] | null;
}

interface MarkdownReference {
  parseFileToOutput?: ParseFileToOutput;
}

interface ParseFileToOutput {
  id: string;
  name: string;
  codeLocation: CodeLocation;
  edges: string[];
  storageLocation: string;
  classInformation?: any;
  functionInformation: FunctionInformation;
}

interface TestExecutionHarness {
  testScript: string;
  imports: string;
  planForTestScriptGeneration: string;
  thoughtsWithExplanation: string;
  codeSymbolName: string;
  testSetupRequired: string;
  testFileLocation: string;
}

interface FileSaveEvent {
  filePath: string;
  codeSymbolName: string;
}

interface CodeModificationContextAndDiff {
  codeModification: string;
  codeDiff: string;
}

interface CodeSymbolModificationInstruction {
  codeSymbolName: string;
  instructions: string;
}

interface CodeSymbolReference {
  id: string;
  name: string;
  codeLocation: CodeLocation;
  edges: string[];
  storageLocation: string;
  classInformation?: any;
  functionInformation: FunctionInformation;
}

interface FunctionInformation {
  name: string;
  codeLocation: CodeLocation;
  docstring?: any;
  decorators: string[];
  scopeType: string;
  className?: string;
  isAsync: boolean;
  rawCode: string;
  comments: string[];
  functionDependencies: FunctionDependency[];
}

interface FunctionDependency {
  functionCallInformation: FunctionCallInformation;
  jediType: JediType;
}

interface JediType {
  fullyQualifiedType?: string;
  attributeType: string;
  modulePath: string;
  isExternalLibraryImport: boolean;
}

interface FunctionCallInformation {
  value: string;
  line: number;
  startColumn: number;
  endColumn: number;
}

interface CodeLocation {
  path: string;
  lineStart: LineStart;
  lineEnd: LineStart;
  directory: string;
  fileName: string;
}

interface LineStart {
  line: number;
  column: number;
}