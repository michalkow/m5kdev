import {
  type Category,
  CHAT_PRICE,
  CHAT_QUALITY,
  CHAT_SPEED,
  CREATIVE_PRICE,
  CREATIVE_QUALITY,
  CREATIVE_SPEED,
  getSortedRecommendedModelIds,
  PLANNING_PRICE,
  PLANNING_QUALITY,
  PLANNING_SPEED,
  RESEARCH_PRICE,
  RESEARCH_QUALITY,
  RESEARCH_SPEED,
  type SortType,
  STRUCTURED_OUTPUT_PRICE,
  STRUCTURED_OUTPUT_QUALITY,
  STRUCTURED_OUTPUT_SPEED,
  TOOL_USE_PRICE,
  TOOL_USE_QUALITY,
  TOOL_USE_SPEED,
} from "./ai.constants";

const sortTypes: SortType[] = ["price", "quality", "speed"];

function testGroup(category: Category, models: Array<readonly string[]>) {
  console.log(category.toUpperCase());
  let index = 0;
  for (const sortType of sortTypes) {
    console.log(category.toUpperCase() + " " + sortType.toUpperCase());
    console.log("Sorted Models");
    console.log(getSortedRecommendedModelIds(category, sortType));
    console.log("Predefined Models");
    console.log(models[index]);
    console.log("--------------------------------");
    index++;
  }
  console.log("Balanced Models");
  console.log(getSortedRecommendedModelIds(category, [50, 25, 25]));
  console.log("====================================");
}

function main() {
  console.log("Testing model Sorting".toUpperCase());
  testGroup("structured_output", [
    STRUCTURED_OUTPUT_PRICE,
    STRUCTURED_OUTPUT_QUALITY,
    STRUCTURED_OUTPUT_SPEED,
  ]);
  testGroup("creative", [CREATIVE_PRICE, CREATIVE_QUALITY, CREATIVE_SPEED]);
  testGroup("research", [RESEARCH_PRICE, RESEARCH_QUALITY, RESEARCH_SPEED]);
  testGroup("chat", [CHAT_PRICE, CHAT_QUALITY, CHAT_SPEED]);
  testGroup("tool_use", [TOOL_USE_PRICE, TOOL_USE_QUALITY, TOOL_USE_SPEED]);
  testGroup("planning", [PLANNING_PRICE, PLANNING_QUALITY, PLANNING_SPEED]);
}

main();
