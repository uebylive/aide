import * as path from "path";
import * as fs from "fs";

// Read and return data from sample.json file in working directory
export const readJSONFromFile = () => {
  const filePath = path.join(__dirname, "../../sample.json");
  const fileData = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(fileData);
};
