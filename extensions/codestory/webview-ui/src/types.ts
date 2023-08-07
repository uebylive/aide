export type EventType =
  | "initial_thinking"
  | "planning_out"
  | "search_for_code_snippets"
  | "search_results"
  | "branch_elements"
  | "code_symbol_modification_instruction"
  | "code_symbol_modification_event"
  | "save_file"
  | "test_execution_harness"
  | "terminal_execution"
  | "execution_branch_finish_reason"
  | "get_references_for_code_node"
  | "exploring_node_dfs"
  | "plan_changes_for_node"
  | "lookup_code_snippets_for_symbols"
  | "changes_to_current_node_on_dfs"
  | "task_complete";

export interface AntonData {
  events: AntonEvent[];
  save_destination: string;
}

export interface AntonEvent {
  event_id: string;
  event_type: EventType;
  event_context?: string;
  event_input?: string;
  event_output?: any;
  event_timestamp: number;
  code_symbol_reference?: Codesymbolreference[];
  stdout?: string;
  stderr?: string;
  code_symbol_name?: string;
  code_symbol_modification_instruction?: CodeSymbolModificationInstruction;
  code_modification_context_and_diff?: CodeModificationContextAndDiff;
  file_save_event?: Filesaveevent;
  execution_event_id?: number;
  test_execution_harness?: Testexecutionharness;
  exit_code?: number;
  args?: string[];
  markdown_references?: MarkdownReference;
  number_of_branch_elements?: number;
  execution_branch_finish_reason?: string;
  code_modification_instruction_list?: CodeSymbolModificationInstruction[];
  code_node_references_for_symbol?: CodeNodeReferencesForSymbol;
  plan_changes_for_node?: PlanChangesForNode;
  lookup_code_snippet_for_symbols?: LookupCodeSnippetForSymbol;
  changes_to_current_node_on_dfs?: ChangesToCurrentNodeOnDfs;
}

interface PlanChangesForNode {
  lookup_types: string[];
  current_node_changes: string[];
  code_node: Codesymbolreference;
}

interface ChangesToCurrentNodeOnDfs {
  code_generation: string;
  current_code_node: Codesymbolreference;
  next_steps: string[];
}

interface LookupCodeSnippetForSymbol {
  current_code_node: Codesymbolreference;
  symbols_to_snippets: MarkdownReference;
}

interface CodeNodeReferencesForSymbol {
  code_node: Codesymbolreference;
  references: Codesymbolreference[];
}

interface MarkdownReference {
  parse_file_to_output?: ParseFileToOutput;
}

interface ParseFileToOutput {
  id: string;
  name: string;
  code_location: Codelocation;
  edges: string[];
  storage_location: string;
  class_information?: any;
  function_information: Functioninformation;
}

interface Testexecutionharness {
  test_script: string;
  imports: string;
  plan_for_test_script_generation: string;
  thoughts_with_explanation: string;
  code_symbol_name: string;
  test_setup_required: string;
  test_file_location: string;
}

interface Filesaveevent {
  file_path: Codelocation;
  code_symbol_name: string;
}

interface CodeModificationContextAndDiff {
  code_modification: string;
  code_diff: string;
}

interface CodeSymbolModificationInstruction {
  code_symbol_name: string;
  instructions: string;
}

export interface Codesymbolreference {
  id: string;
  name: string;
  code_location: Codelocation;
  edges: string[];
  storage_location: string;
  class_information?: any;
  function_information: Functioninformation;
  // This is not sent by the backend but is added during extension processing.
  event_context: string;
}

interface Functioninformation {
  name: string;
  code_location: Codelocation;
  docstring?: any;
  decorators: string[];
  scope_type: string;
  class_name?: string;
  is_async: boolean;
  raw_code: string;
  comments: string[];
  function_dependencies: Functiondependency[];
}

interface Functiondependency {
  function_call_information: Functioncallinformation;
  jedi_type: Jeditype;
}

interface Jeditype {
  fully_qualified_type?: string;
  attribute_type: string;
  module_path: string;
  is_external_library_import: boolean;
}

interface Functioncallinformation {
  value: string;
  line: number;
  start_column: number;
  end_column: number;
}

interface Codelocation {
  path: string;
  line_start: Linestart;
  line_end: Linestart;
  directory: string;
  file_name: string;
}

interface Linestart {
  line: number;
  column: number;
}
