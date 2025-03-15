const CodingChallenge = require("../models/CodingChallengeSchema");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
          "input": "A small but representative extreme test case that demonstrates behavior at or near constraint boundaries",
          "output": "Corresponding expected output"
        }
      ],
      "explanation": "A detailed, step-by-step explanation of how to approach and solve the problem, including time and space complexity analysis and alternative approaches if relevant. Explain your reasoning behind the public test cases."
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
    9. CRITICAL: For edge cases, provide a SMALL test case that demonstrates the boundary condition behavior
    10. CRITICAL: Create EXACTLY 4 private test cases that test different aspects of the solution
    
    IMPORTANT RULES FOR TEST CASES:
    - ALL test cases must include BOTH input and output as complete, non-empty strings
    - DO NOT use placeholders, ellipses, or any abbreviated notation in test cases
    - DO NOT use any programmatic expressions (like 'join', 'range', string multiplication, concatenation)
    - For edge cases requiring very large inputs, create a smaller representative example that tests the same logic
    - Test cases must be direct string values that could be directly typed into a terminal
    - ALWAYS include concrete values for both input and output fields`;

    // First attempt with primary model
    let aiResponse;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
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
        max_tokens: 8000,
      });

      aiResponse = response.choices[0].message.content;
      console.log("Raw AI Response:", aiResponse);
    } catch (aiError) {
      console.error("AI model error:", aiError);

      // Fall back to default challenge if AI call fails
      return res
        .status(200)
        .json(getFallbackChallenge(prompt, difficultyPreference));
    }

    // Clean the response
    aiResponse = aiResponse.replace(/```json|```/g, "").trim();

    // Parse the JSON response
    let challengeData;
    try {
      challengeData = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);

      // Try to fix common JSON issues
      const fixedJSON = tryToFixJSON(aiResponse);
      try {
        challengeData = JSON.parse(fixedJSON);
      } catch (secondParseError) {
        // If still failing, return fallback challenge
        console.error("Could not fix JSON. Using fallback challenge");
        return res
          .status(200)
          .json(getFallbackChallenge(prompt, difficultyPreference));
      }
    }

    // Ensure all required fields exist
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

    // Fix any missing fields or use defaults
    for (const field of requiredFields) {
      if (!challengeData[field]) {
        console.warn(`Missing required field: ${field}, applying default`);
        challengeData[field] = getDefaultValueForField(
          field,
          prompt,
          difficultyPreference
        );
      }
    }

    // Ensure arrays have correct elements
    if (
      !Array.isArray(challengeData.publicTestCases) ||
      challengeData.publicTestCases.length < 2
    ) {
      challengeData.publicTestCases = getDefaultPublicTestCases();
    }

    if (
      !Array.isArray(challengeData.privateTestCases) ||
      challengeData.privateTestCases.length !== 4
    ) {
      challengeData.privateTestCases = getDefaultPrivateTestCases();
    }

    if (
      !Array.isArray(challengeData.edgeCases) ||
      challengeData.edgeCases.length !== 1
    ) {
      challengeData.edgeCases = getDefaultEdgeCases();
    }

    // Fix test cases
    const fixTestCase = (testCase, index, type) => {
      // Make a defensive copy
      const fixedTestCase = { ...testCase };

      // Ensure input exists and is a string
      if (!fixedTestCase.input || typeof fixedTestCase.input !== "string") {
        fixedTestCase.input = `${type}_input_example_${index}`;
      }

      // Ensure output exists and is a string
      if (
        fixedTestCase.output === undefined ||
        typeof fixedTestCase.output !== "string"
      ) {
        fixedTestCase.output = `${type}_output_example_${index}`;
      }

      // Remove any problematic content
      fixedTestCase.input = fixedTestCase.input.replace(
        /\.\.\.|join\(|\+|\*|range\(/g,
        "_"
      );
      fixedTestCase.output = fixedTestCase.output.replace(
        /\.\.\.|join\(|\+|\*|range\(/g,
        "_"
      );

      return fixedTestCase;
    };

    challengeData.publicTestCases = challengeData.publicTestCases.map((tc, i) =>
      fixTestCase(tc, i, "public")
    );

    challengeData.privateTestCases = challengeData.privateTestCases.map(
      (tc, i) => fixTestCase(tc, i, "private")
    );

    challengeData.edgeCases = challengeData.edgeCases.map((tc, i) =>
      fixTestCase(tc, i, "edge")
    );

    // Create and save the challenge
    const newChallenge = new CodingChallenge({
      ...challengeData,
      prompt,
      createdAt: new Date(),
      userId: req.user ? req.user._id : null,
    });

    const savedChallenge = await newChallenge.save();
    return res.status(201).json(savedChallenge);
  } catch (error) {
    console.error("Error generating challenge:", error);

    // Always return a valid response, never an error
    return res
      .status(200)
      .json(getFallbackChallenge(prompt, difficultyPreference));
  }
};

// Helper functions to provide fallbacks
function getFallbackChallenge(prompt, difficultyPreference) {
  return {
    title: `Challenge: ${prompt.slice(0, 50)}...`,
    difficultyLevel: difficultyPreference || "Medium",
    description: "Write a program to solve the following problem: " + prompt,
    inputFormat: "Input format will be provided in plain text.",
    outputFormat: "Output should be provided in plain text.",
    constraints: "Standard time and space complexity constraints apply.",
    publicTestCases: getDefaultPublicTestCases(),
    privateTestCases: getDefaultPrivateTestCases(),
    edgeCases: getDefaultEdgeCases(),
    explanation:
      "Solve this problem using appropriate algorithms and data structures based on the requirements.",
    generatedFallback: true,
  };
}

function getDefaultPublicTestCases() {
  return [
    { input: "sample_input_1", output: "sample_output_1" },
    { input: "sample_input_2", output: "sample_output_2" },
  ];
}

function getDefaultPrivateTestCases() {
  return [
    { input: "private_test_1", output: "private_result_1" },
    { input: "private_test_2", output: "private_result_2" },
    { input: "private_test_3", output: "private_result_3" },
    { input: "private_test_4", output: "private_result_4" },
  ];
}

function getDefaultEdgeCases() {
  return [{ input: "edge_case_input", output: "edge_case_output" }];
}

function getDefaultValueForField(field, prompt, difficultyPreference) {
  const defaults = {
    title: `Challenge based on: ${prompt.slice(0, 30)}...`,
    difficultyLevel: difficultyPreference || "Medium",
    description: "Write a program to solve the following problem: " + prompt,
    inputFormat: "Input format will be provided in plain text.",
    outputFormat: "Output should be provided in plain text.",
    constraints: "Standard time and space complexity constraints apply.",
    explanation:
      "Solve this problem using appropriate algorithms and data structures.",
  };

  return defaults[field] || `Default ${field}`;
}

function tryToFixJSON(jsonString) {
  // Add missing quotes around keys
  let fixed = jsonString.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  // Fix trailing commas
  fixed = fixed.replace(/,(\s*[}\]])/g, "$1");

  // Add missing braces if needed
  if (!fixed.trim().startsWith("{")) {
    fixed = "{" + fixed;
  }
  if (!fixed.trim().endsWith("}")) {
    fixed = fixed + "}";
  }

  return fixed;
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
