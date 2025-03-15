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
9. CRITICAL: You MUST provide exactly ONE edge case that uses the MAXIMUM possible constraint values (at or very near 10^9 where applicable)
10. CRITICAL: Create EXACTLY 4 private test cases that test different aspects of the solution

IMPORTANT: For the single edge case, use actual maximum values of 10^9 (or 10^9 - 1) where the constraints allow. Do not use smaller values. If the actual maximum input would be impractically large to represent fully (e.g., an array with 10^9 elements), structure the test case to still push the solution to its limits while having a reasonable representation.`;

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
      max_tokens: 3000,
    });

    let aiResponse = response.choices[0].message.content;
    console.log("Raw AI Response:", aiResponse);

    // Clean and parse JSON
    aiResponse = aiResponse.replace(/```json|```/g, "").trim();
    let challengeData;
    try {
      challengeData = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      return res.status(500).json({ message: "Invalid JSON response from AI" });
    }
    console.log("Parsed Challenge Data:", challengeData);

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
    for (const field of requiredFields) {
      if (!challengeData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate test case structures
    if (
      !Array.isArray(challengeData.publicTestCases) ||
      challengeData.publicTestCases.length < 2
    ) {
      throw new Error("Challenge must have at least 2 public test cases");
    }

    if (
      !Array.isArray(challengeData.privateTestCases) ||
      challengeData.privateTestCases.length !== 4
    ) {
      throw new Error("Challenge must have exactly 4 private test cases");
    }

    if (
      !Array.isArray(challengeData.edgeCases) ||
      challengeData.edgeCases.length !== 1
    ) {
      throw new Error("Challenge must have exactly 1 edge case");
    }

    // Validate the single edge case contains maximum values
    const edgeCaseStr = JSON.stringify(challengeData.edgeCases);
    if (!edgeCaseStr.includes("10^9") && !edgeCaseStr.includes("1000000000")) {
      console.warn(
        "Edge case may not contain maximum constraint values (10^9)"
      );

      // Add a validation message
      challengeData.validationWarning =
        "Edge case might not properly test maximum constraints (10^9)";
    }

    // Validate test case format
    const validateTestCase = (testCase, type) => {
      if (!testCase.input || typeof testCase.input !== "string") {
        throw new Error(`Invalid input format in ${type} test case`);
      }
      if (!testCase.output || typeof testCase.output !== "string") {
        throw new Error(`Invalid output format in ${type} test case`);
      }
      return testCase;
    };

    challengeData.publicTestCases = challengeData.publicTestCases.map((tc) =>
      validateTestCase(tc, "public")
    );
    challengeData.privateTestCases = challengeData.privateTestCases.map((tc) =>
      validateTestCase(tc, "private")
    );
    challengeData.edgeCases = challengeData.edgeCases.map((tc) =>
      validateTestCase(tc, "edge")
    );

    // Create and save the challenge
    const newChallenge = new CodingChallenge({
      ...challengeData,
      prompt,
      createdAt: new Date(),
      userId: req.user ? req.user._id : null,
    });

    const savedChallenge = await newChallenge.save();
    res.status(201).json(savedChallenge);
  } catch (error) {
    console.error("Error generating challenge:", error);
    res.status(500).json({
      message: "Error generating challenge",
      error: error.message,
    });
  }
};

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
