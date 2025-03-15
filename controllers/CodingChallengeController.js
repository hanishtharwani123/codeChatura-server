const CodingChallenge = require("../models/CodingChallengeSchema");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate a coding challenge
const generateChallenge = async (req, res) => {
  try {
    const { prompt, difficultyPreference } = req.body;

    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }

    const systemPrompt = `You are an expert computer science instructor and competitive programming problem setter who designs challenges for platforms like LeetCode and CodeForces. Create a professional-quality, original coding challenge based on the user's request.

IMPORTANT OUTPUT FORMAT:
Return a valid JSON object with the following structure (and no additional text):

{
  "title": "A concise, professional title that clearly indicates the problem type",
  "difficultyLevel": "${
    difficultyPreference ||
    'Choose one: "Easy", "Medium", or "Hard" based on algorithmic complexity and constraints'
  }",
  "description": "A clear, detailed problem statement with realistic context. Use paragraphs and proper formatting. Avoid ambiguity.",
  "inputFormat": "A precise description of input format including data types, ranges, and structure",
  "outputFormat": "A precise description of what the output should be and its format",
  "constraints": "List all numerical constraints using standard notation (e.g., 1 ≤ n ≤ 10^5, -10^9 ≤ arr[i] ≤ 10^9). Include time/space complexity expectations when relevant.",
  "publicTestCases": [
    {
      "input": "Sample input exactly as it would appear in stdin",
      "output": "Expected output exactly as it should appear in stdout"
    },
    {
      "input": "Another sample input covering a different scenario",
      "output": "Corresponding expected output"
    }
  ],
  "privateTestCases": [
    {
      "input": "More complex test case covering specific edge scenarios",
      "output": "Corresponding expected output"
    },
    {
      "input": "Another test case that tests different aspects",
      "output": "Corresponding expected output"
    },
    {
      "input": "Test case that verifies optimal solution requirements",
      "output": "Corresponding expected output"
    },
    {
      "input": "Test case with large but not maximum constraint values",
      "output": "Corresponding expected output"
    }
  ],
  "edgeCases": [
    {
      "input": "A SINGLE extreme borderline test case using the MAXIMUM allowed constraint values (exactly at 10^9 where applicable). This MUST push the solution to its absolute limits.",
      "output": "Corresponding expected output"
    }
  ],
  "explanation": "A detailed, step-by-step explanation of how to approach and solve the problem, including time and space complexity analysis and alternative approaches if relevant. Explain your reasoning behind the public test cases. Keep explanation concise and under 800 words."
}

GUIDELINES FOR CREATING PROFESSIONAL CODING CHALLENGES:
1. Design problems that test algorithmic thinking and data structure knowledge
2. Ensure problem statements are unambiguous and have a clear objective
3. Include realistic constraints that force specific algorithmic choices
4. Create test cases that cover normal cases, edge cases, and performance boundaries
5. Make sure all test cases are correct and follow the specified input/output formats
6. Provide explanations that teach problem-solving approaches, not just solutions
7. Use standard algorithm/DS terminology in your explanations (e.g., dynamic programming, greedy algorithms, graph traversal)
8. For Hard problems, design multi-step solutions requiring complex algorithmic knowledge
9. CRITICAL: You MUST provide exactly ONE edge case that uses the MAXIMUM possible constraint values (at or very near 10^9 where applicable)
10. CRITICAL: Create EXACTLY 4 private test cases that test different aspects of the solution

IMPORTANT: 
- For the single edge case, use actual maximum values of 10^9 (or 10^9 - 1) where the constraints allow. Do not use smaller values.
- Your response MUST be a valid, parseable JSON object with no extra text before or after.
- DO NOT include markdown code blocks or backticks in your response - just pure JSON.
- CAREFULLY check that all quotes, braces, and brackets are properly balanced and escaped.
- DO NOT use template literals or expressions inside string values.
- MAKE SURE to properly escape all special characters in strings (especially quotes and newlines).`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using a better model for higher quality challenges
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 8000, // Increased from 3000 to ensure complete responses
    });

    let aiResponse = response.choices[0].message.content;
    console.log("Raw AI Response:", aiResponse);

    // Enhanced multi-stage JSON cleaning and parsing
    try {
      // Step 1: Basic cleanup - Remove markdown code blocks
      aiResponse = aiResponse.replace(/```json|```/g, "").trim();

      // Step 2: Remove any non-JSON text before opening brace and after closing brace
      const firstBraceIndex = aiResponse.indexOf("{");
      if (firstBraceIndex > 0) {
        aiResponse = aiResponse.substring(firstBraceIndex);
      }

      const lastBraceIndex = aiResponse.lastIndexOf("}");
      if (lastBraceIndex !== -1 && lastBraceIndex < aiResponse.length - 1) {
        aiResponse = aiResponse.substring(0, lastBraceIndex + 1);
      }

      // Step 3: First attempt - Try direct parsing
      try {
        const challengeData = JSON.parse(aiResponse);
        console.log("Successfully parsed JSON on first attempt");

        // If we got here, proceed with the challenge processing
        processAndSaveChallenge(challengeData, prompt, req, res);
        return; // Exit function after successful processing
      } catch (initialParseError) {
        console.log("Initial JSON parse failed, attempting repairs...");
        // Continue to more advanced repairs
      }

      // Step 4: Fix potential JSON syntax issues
      let repairedJson = repairJsonSyntax(aiResponse);

      // Step 5: Try parsing again with repaired JSON
      try {
        const challengeData = JSON.parse(repairedJson);
        console.log("Successfully parsed JSON after syntax repair");

        // If successful, process the challenge
        processAndSaveChallenge(challengeData, prompt, req, res, true);
        return; // Exit function after successful processing
      } catch (secondParseError) {
        console.log("Syntax repair failed, attempting deeper fixes...");
        // Continue to more aggressive repairs
      }

      // Step 6: More aggressive structure-aware repairs
      repairedJson = repairJsonStructure(aiResponse);

      // Final attempt to parse
      const challengeData = JSON.parse(repairedJson);
      console.log("Successfully parsed JSON after structure repair");

      // Process the challenge with a flag indicating heavy repairs were needed
      processAndSaveChallenge(challengeData, prompt, req, res, true);
    } catch (finalError) {
      // If all repair attempts fail
      console.error("All JSON repair attempts failed:", finalError);

      // Create a simpler challenge structure as fallback
      try {
        const fallbackChallenge = createFallbackChallenge(aiResponse, prompt);
        console.log("Created fallback challenge");

        // Save the fallback challenge
        const newChallenge = new CodingChallenge({
          ...fallbackChallenge,
          prompt,
          createdAt: new Date(),
          userId: req.user ? req.user._id : null,
          wasRepaired: true,
          isFallback: true,
        });

        const savedChallenge = await newChallenge.save();
        res.status(201).json({
          ...savedChallenge.toObject(),
          warning:
            "Challenge was created using fallback mode due to parsing errors.",
        });
      } catch (fallbackError) {
        // If even the fallback fails, return detailed error
        return res.status(500).json({
          message: "Failed to process AI response",
          details:
            "The AI generated malformed JSON that couldn't be repaired. Please try again with a simpler prompt.",
          error: finalError.message,
        });
      }
    }
  } catch (error) {
    console.error("Error generating challenge:", error);
    res.status(500).json({
      message: "Error generating challenge",
      error: error.message,
    });
  }
};

// Function to process and save a valid challenge
function processAndSaveChallenge(
  challengeData,
  prompt,
  req,
  res,
  wasRepaired = false
) {
  // Validate required fields
  const requiredFields = [
    "title",
    "difficultyLevel",
    "description",
    "inputFormat",
    "outputFormat",
    "constraints",
    "publicTestCases",
    "privateTestCases",
    "edgeCases",
    "explanation",
  ];

  const missingFields = [];
  for (const field of requiredFields) {
    if (!challengeData[field]) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Challenge data is incomplete",
      missingFields: missingFields,
    });
  }

  // Validate test case structures
  if (
    !Array.isArray(challengeData.publicTestCases) ||
    challengeData.publicTestCases.length < 1
  ) {
    // Fix: Add a default test case if missing
    if (!Array.isArray(challengeData.publicTestCases)) {
      challengeData.publicTestCases = [
        { input: "Sample input", output: "Sample output" },
      ];
    }

    // Add warning
    challengeData.validationWarning =
      (challengeData.validationWarning || "") +
      " Public test cases were incomplete and have been supplemented.";
  }

  if (
    !Array.isArray(challengeData.privateTestCases) ||
    challengeData.privateTestCases.length < 4
  ) {
    // Fix: Add or pad private test cases if needed
    if (!Array.isArray(challengeData.privateTestCases)) {
      challengeData.privateTestCases = [];
    }

    while (challengeData.privateTestCases.length < 4) {
      challengeData.privateTestCases.push({
        input: `Auto-generated test case ${
          challengeData.privateTestCases.length + 1
        }`,
        output: "Expected output",
      });
    }

    // Add warning
    challengeData.validationWarning =
      (challengeData.validationWarning || "") +
      " Private test cases were incomplete and have been supplemented.";
  }

  if (
    !Array.isArray(challengeData.edgeCases) ||
    challengeData.edgeCases.length < 1
  ) {
    // Fix: Add a default edge case if missing
    challengeData.edgeCases = [
      { input: "Edge case with maximum values", output: "Expected output" },
    ];

    // Add warning
    challengeData.validationWarning =
      (challengeData.validationWarning || "") +
      " Edge case was missing and has been added.";
  }

  // Validate the single edge case contains maximum values
  const edgeCaseStr = JSON.stringify(challengeData.edgeCases);
  if (!edgeCaseStr.includes("10^9") && !edgeCaseStr.includes("1000000000")) {
    console.warn("Edge case may not contain maximum constraint values (10^9)");

    // Add a validation warning
    challengeData.validationWarning =
      (challengeData.validationWarning || "") +
      " Edge case might not properly test maximum constraints (10^9).";
  }

  // Validate test case format
  const validateTestCase = (testCase, type) => {
    if (!testCase.input || typeof testCase.input !== "string") {
      testCase.input = `Default ${type} input`;
    }
    if (!testCase.output || typeof testCase.output !== "string") {
      testCase.output = `Default ${type} output`;
    }
    return testCase;
  };

  try {
    challengeData.publicTestCases = challengeData.publicTestCases.map((tc) =>
      validateTestCase(tc, "public")
    );
    challengeData.privateTestCases = challengeData.privateTestCases.map((tc) =>
      validateTestCase(tc, "private")
    );
    challengeData.edgeCases = challengeData.edgeCases.map((tc) =>
      validateTestCase(tc, "edge")
    );
  } catch (validationError) {
    console.warn("Test case validation issues:", validationError.message);
    // Instead of failing, add a warning
    challengeData.validationWarning =
      (challengeData.validationWarning || "") +
      ` Test case validation issues: ${validationError.message}`;
  }

  const newChallenge = new CodingChallenge({
    ...challengeData,
    prompt,
    createdAt: new Date(),
    userId: req.user ? req.user._id : null,
    wasRepaired: wasRepaired,
  });

  newChallenge
    .save()
    .then((savedChallenge) => {
      res.status(201).json(savedChallenge);
    })
    .catch((saveError) => {
      console.error("Error saving challenge:", saveError);
      res.status(500).json({
        message: "Error saving challenge",
        error: saveError.message,
      });
    });
}

// Helper function to repair JSON syntax issues
function repairJsonSyntax(jsonString) {
  // Fix unescaped quotes in string values
  let inString = false;
  let result = "";
  let i = 0;

  while (i < jsonString.length) {
    const char = jsonString[i];

    if (char === '"' && (i === 0 || jsonString[i - 1] !== "\\")) {
      inString = !inString;
      result += char;
    } else if (inString && char === '"' && jsonString[i - 1] !== "\\") {
      // Escape quotes inside strings
      result += '\\"';
    } else if (inString && (char === "\n" || char === "\r")) {
      // Replace literal newlines with escaped newlines in strings
      result += "\\n";
    } else {
      result += char;
    }

    i++;
  }

  // Fix missing commas between array items
  result = result.replace(/}(\s*){/g, "},\n{"); // Missing commas between objects
  result = result.replace(/](\s*)\[/g, "],\n["); // Missing commas between arrays
  result = result.replace(/}(\s*)\[/g, "},\n["); // Missing commas between object and array
  result = result.replace(/](\s*){/g, "],\n{"); // Missing commas between array and object

  // Fix control characters
  result = result.replace(/[\x00-\x1F\x7F]/g, "");

  // Balance braces and brackets
  const openBraces = (result.match(/{/g) || []).length;
  const closeBraces = (result.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    result += "}".repeat(openBraces - closeBraces);
  }

  const openBrackets = (result.match(/\[/g) || []).length;
  const closeBrackets = (result.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    result += "]".repeat(openBrackets - closeBrackets);
  }

  return result;
}

// More advanced repair for structural issues
function repairJsonStructure(jsonString) {
  // First apply syntax fixes
  let result = repairJsonSyntax(jsonString);

  // Check for truncated test cases
  const testCaseRegex =
    /"(publicTestCases|privateTestCases|edgeCases)"\s*:\s*\[/g;
  let match;
  while ((match = testCaseRegex.exec(result)) !== null) {
    const startPos = match.index;
    const testCaseType = match[1];

    // Find the corresponding closing bracket
    let openBrackets = 1;
    let endPos = match.index + match[0].length;

    while (openBrackets > 0 && endPos < result.length) {
      if (result[endPos] === "[") openBrackets++;
      if (result[endPos] === "]") openBrackets--;
      endPos++;
    }

    // If we didn't find a closing bracket, the array is truncated
    if (openBrackets > 0) {
      // Get the content so far
      const partialContent = result.substring(
        startPos + match[0].length,
        result.length
      );

      // Count complete test cases
      const completeTestCases = (
        partialContent.match(
          /"input"\s*:\s*".*?"\s*,\s*"output"\s*:\s*".*?"/g
        ) || []
      ).length;

      // Find the last complete test case
      let lastCompletePos = 0;
      for (let i = 0; i < completeTestCases; i++) {
        const inputMatch = partialContent.indexOf('"input"', lastCompletePos);
        const outputMatch = partialContent.indexOf('"output"', inputMatch);

        if (inputMatch !== -1 && outputMatch !== -1) {
          // Find the end of this test case
          const endQuote = partialContent.indexOf('"', outputMatch + 10);
          if (endQuote !== -1) {
            lastCompletePos = endQuote + 1;
          }
        }
      }

      // If we found at least one complete test case, truncate after it
      if (lastCompletePos > 0) {
        const preContent = result.substring(
          0,
          startPos + match[0].length + lastCompletePos
        );
        const postContent = result.substring(endPos);
        result = preContent + "]" + postContent;
      } else {
        // If we couldn't find any complete test cases, provide a default array
        const preContent = result.substring(0, startPos + match[0].length);
        const postContent = result.substring(endPos);
        result =
          preContent +
          '{"input":"Default input","output":"Default output"}]' +
          postContent;
      }
    }
  }

  // Ensure the top-level structure is valid
  const requiredFields = [
    "title",
    "difficultyLevel",
    "description",
    "inputFormat",
    "outputFormat",
    "constraints",
    "publicTestCases",
    "privateTestCases",
    "edgeCases",
    "explanation",
  ];

  for (const field of requiredFields) {
    if (!result.includes(`"${field}"`)) {
      // If a required field is missing, add it near the end
      const lastBraceIndex = result.lastIndexOf("}");
      if (lastBraceIndex !== -1) {
        let defaultValue = `"${field}": "Default ${field}"`;
        if (
          field === "publicTestCases" ||
          field === "privateTestCases" ||
          field === "edgeCases"
        ) {
          defaultValue = `"${field}": [{"input":"Default input","output":"Default output"}]`;
        }

        // Check if we need to add a comma
        const needsComma =
          result.substring(0, lastBraceIndex).trim().endsWith("}") ||
          result.substring(0, lastBraceIndex).trim().endsWith("]");

        const insertValue = (needsComma ? "," : "") + defaultValue;
        result =
          result.substring(0, lastBraceIndex) +
          insertValue +
          result.substring(lastBraceIndex);
      }
    }
  }

  return result;
}

// Create a fallback challenge when all parsing attempts fail
function createFallbackChallenge(aiResponse, prompt) {
  // Extract as much information as possible from the AI response
  const extractField = (fieldName) => {
    const regex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`, "i");
    const match = aiResponse.match(regex);
    return match ? match[1] : `Default ${fieldName}`;
  };

  // Extract title if possible
  let title = extractField("title");
  if (title === "Default title") {
    // Try to create a title from the prompt
    title = "Coding Challenge: " + prompt.split(" ").slice(0, 5).join(" ");
  }

  // Build a basic challenge structure
  return {
    title,
    difficultyLevel: extractField("difficultyLevel"),
    description: extractField("description"),
    inputFormat: "Input format could not be parsed from AI response",
    outputFormat: "Output format could not be parsed from AI response",
    constraints: "Default constraints",
    publicTestCases: [
      {
        input: "Sample input",
        output: "Sample output",
      },
    ],
    privateTestCases: [
      { input: "Test case 1", output: "Output 1" },
      { input: "Test case 2", output: "Output 2" },
      { input: "Test case 3", output: "Output 3" },
      { input: "Test case 4", output: "Output 4" },
    ],
    edgeCases: [
      {
        input: "Edge case with maximum values",
        output: "Expected output for edge case",
      },
    ],
    explanation:
      "This challenge was created in fallback mode due to parsing errors. " +
      "Please review and edit the challenge details as needed.",
    wasRepaired: true,
    isFallback: true,
    originalPrompt: prompt,
  };
}

// Get all challenges
const getChallenges = async (req, res) => {
  try {
    const challenges = await CodingChallenge.find({}).sort({ createdAt: -1 });
    res.status(200).json(challenges);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching challenges", error: error.message });
  }
};

// Get a challenge by ID
const getChallengeById = async (req, res) => {
  try {
    const challenge = await CodingChallenge.findById(req.params.id);

    if (!challenge) {
      return res.status(404).json({ message: "Challenge not found" });
    }

    res.status(200).json(challenge);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching challenge", error: error.message });
  }
};

module.exports = {
  generateChallenge,
  getChallenges,
  getChallengeById,
};
