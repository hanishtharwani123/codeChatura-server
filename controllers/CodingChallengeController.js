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

    // Enhanced prompt for professional coding problems with proper edge cases
    const systemPrompt = `You are a professional problem setter for platforms like LeetCode and CodeForces. Create a high-quality, production-ready coding challenge based on the user's request.
    
    Return a JSON object with:
    {
      "title": "Concise, professional title that clearly indicates the problem type",
      "difficultyLevel": "${
        difficultyPreference ||
        'Choose: "Easy", "Medium", or "Hard" based on algorithmic complexity'
      }",
      "description": "Detailed problem statement with realistic context. Include paragraphs and clear formatting. Make this read like a professional LeetCode problem.",
      "inputFormat": "Precise description of input format including data types, ranges, and structure",
      "outputFormat": "Precise description of expected output format",
      "constraints": "All constraints as a single string, separated by semicolons (e.g., '1 ≤ n ≤ 10^5; -10^9 ≤ arr[i] ≤ 10^9; Time complexity: O(n log n)')",
      "publicTestCases": [
        { "input": "Sample input exactly as it would appear", "output": "Expected output exactly as it should appear" },
        { "input": "Another sample input covering a different scenario", "output": "Corresponding expected output" }
      ],
      "privateTestCases": [
        { "input": "Test case for common operations", "output": "Expected output" },
        { "input": "Test case with challenging but valid inputs", "output": "Expected output" },
        { "input": "Test case that verifies optimal solution", "output": "Expected output" },
        { "input": "Test case with moderately large values", "output": "Expected output" }
      ],
      "edgeCases": [
        { "input": "Edge case with values at or near constraint boundaries (e.g., maximum allowed array size, minimum/maximum values)", "output": "Corresponding expected output" }
      ],
      "explanation": "Professional step-by-step explanation of the solution approach, including time and space complexity analysis. Follow LeetCode's style by explaining algorithm choices and optimization techniques."
    }
    
    CRITICAL REQUIREMENTS:
    1. The problem must be ORIGINAL but representative of professional coding problems
    2. Constraints MUST be a single STRING, not an array
    3. Edge cases MUST test boundary conditions with large (but valid) values where appropriate
    4. All test cases must have complete input/output strings (no placeholders or ellipses)
    5. Create exactly 4 private test cases
    6. The problem description should match the quality of top competitive programming websites
    7. Include realistic constraints that force specific algorithmic choices
    8. Ensure problem statements are unambiguous with clear objectives
    9. For Hard problems, design multi-step solutions requiring advanced algorithmic knowledge
    10. Use standard algorithm terminology in explanations (e.g., DP, BFS, greedy approach)`;

    // AI request
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" }, // Ensures proper JSON format
    });

    // Parse the response
    let challengeData;
    try {
      challengeData = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      return res
        .status(200)
        .json(getFallbackChallenge(req.body.prompt, difficultyPreference));
    }

    // Validate and fix required fields
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

    // Check if any required field is missing
    const missingFields = requiredFields.filter(
      (field) => !challengeData[field]
    );
    if (missingFields.length > 0) {
      console.warn(`Missing fields: ${missingFields.join(", ")}`);
      return res
        .status(200)
        .json(getFallbackChallenge(req.body.prompt, difficultyPreference));
    }

    // Fix constraints if it's an array
    if (Array.isArray(challengeData.constraints)) {
      challengeData.constraints = challengeData.constraints.join("; ");
    }

    // Validate test case arrays
    if (
      !Array.isArray(challengeData.publicTestCases) ||
      !Array.isArray(challengeData.privateTestCases) ||
      !Array.isArray(challengeData.edgeCases) ||
      challengeData.publicTestCases.length < 2 ||
      challengeData.privateTestCases.length !== 4 ||
      challengeData.edgeCases.length === 0
    ) {
      console.warn("Invalid test case structure");
      return res
        .status(200)
        .json(getFallbackChallenge(req.body.prompt, difficultyPreference));
    }

    // Create and save the challenge
    const newChallenge = new CodingChallenge({
      ...challengeData,
      prompt: req.body.prompt,
      createdAt: new Date(),
      userId: req.user ? req.user._id : null,
    });

    const savedChallenge = await newChallenge.save();
    return res.status(201).json(savedChallenge);
  } catch (error) {
    console.error("Error generating challenge:", error);
    return res
      .status(200)
      .json(getFallbackChallenge(req.body.prompt, difficultyPreference));
  }
};

// Helper function to provide fallback with professional quality
function getFallbackChallenge(prompt, difficultyPreference) {
  return {
    title: `${prompt.slice(0, 30).trim()} Challenge`,
    difficultyLevel: difficultyPreference || "Medium",
    description: `Create an algorithm to solve the following problem:\n\n${prompt}\n\nDevelop an efficient solution that handles all possible input cases.`,
    inputFormat:
      "Input will be provided according to standard competitive programming conventions.",
    outputFormat:
      "Output should follow the format specified in the problem statement.",
    constraints:
      "1 ≤ n ≤ 10^5; Time complexity should be optimal for the problem; Space complexity should be minimized.",
    publicTestCases: [
      { input: "5\n1 2 3 4 5", output: "15" },
      { input: "3\n10 20 30", output: "60" },
    ],
    privateTestCases: [
      { input: "1\n100", output: "100" },
      { input: "10\n5 8 3 9 2 1 7 4 6 0", output: "45" },
      { input: "7\n-5 -10 8 3 -2 4 1", output: "-1" },
      { input: "0\n", output: "0" },
    ],
    edgeCases: [
      { input: "100000\n" + Array(100000).fill(1).join(" "), output: "100000" },
    ],
    explanation:
      "This problem requires an efficient algorithm that processes the input data. Consider using appropriate data structures and algorithms based on the specific constraints. Analyze the time and space complexity to ensure your solution is optimal.",
    generatedFallback: true,
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
