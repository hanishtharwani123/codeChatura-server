const MCQ = require("../models/MCQChallengeSchema");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateMCQ = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert instructor creating high-quality multiple-choice questions for professional software engineers and developers. 

CONTENT REQUIREMENTS:
- Create professional, educational MCQs with exactly 4 options (A, B, C, D)
- Ensure only one option is correct
- Target appropriate complexity for professional developers
- Include challenging distractors that test common misconceptions
- Focus on practical, real-world scenarios relevant to professional engineers

FORMATTING GUIDELINES:
- ALL content must be properly formatted for correct display
- ALL code snippets must be inside proper markdown code blocks with appropriate language tags
- ALL tables must be properly formatted with consistent alignment and header separators
- Ensure proper spacing before and after all special elements (code blocks, tables, etc.)
- Use consistent indentation and formatting throughout

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:

TITLE: [Concise, descriptive title]
DIFFICULTY: [Easy/Medium/Hard]
QUESTION: [Clear, unambiguous question text]

[Any supporting content with proper formatting]

OPTIONS:
A: [Option A text]
B: [Option B text]
C: [Option C text]
D: [Option D text]
CORRECT: [Correct option letter only - A, B, C, or D]
EXPLANATION: [Detailed explanation with reasoning for correct answer and why others are wrong]`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    let aiResponse = response.choices[0].message.content;

    // Enhanced parsing with more robust regex patterns
    const titleMatch = aiResponse.match(/TITLE:\s*(.*?)(?=\n|$)/is);
    const difficultyMatch = aiResponse.match(/DIFFICULTY:\s*(.*?)(?=\n|$)/is);
    const questionMatch = aiResponse.match(
      /QUESTION:\s*([\s\S]*?)(?=OPTIONS:|$)/is
    );
    const optionsMatch = aiResponse.match(
      /OPTIONS:\s*([\s\S]*?)(?=CORRECT:|$)/is
    );
    const correctMatch = aiResponse.match(/CORRECT:\s*([A-D])/is);
    const explanationMatch = aiResponse.match(
      /EXPLANATION:\s*([\s\S]*?)(?=$)/is
    );

    // Validate all required parts are present
    if (
      !titleMatch ||
      !difficultyMatch ||
      !questionMatch ||
      !optionsMatch ||
      !correctMatch ||
      !explanationMatch
    ) {
      console.error("Parsing error with AI response:", aiResponse);
      return res.status(500).json({
        message: "Invalid response format from AI",
        details: "Response missing required sections",
      });
    }

    // Extract and clean options
    const optionsText = optionsMatch[1].trim();
    const optionsArray = [];
    const optionRegex = /([A-D]):\s*([\s\S]*?)(?=(?:[A-D]:|CORRECT:|$))/g;

    let optionMatch;
    while ((optionMatch = optionRegex.exec(optionsText + "\n"))) {
      optionsArray.push({
        id: optionMatch[1],
        text: optionMatch[2].trim(),
      });
    }

    // Validate we have exactly 4 options
    if (optionsArray.length !== 4) {
      console.error("Invalid options count:", optionsArray.length);
      return res.status(500).json({
        message: `Invalid number of options in AI response: found ${optionsArray.length} instead of 4`,
      });
    }

    // Create the MCQ object
    const mcqData = {
      title: titleMatch[1].trim(),
      difficultyLevel: difficultyMatch[1].trim(),
      question: questionMatch[1].trim(),
      options: optionsArray,
      correctOptionId: correctMatch[1].trim(),
      explanation: explanationMatch[1].trim(),
      prompt,
    };

    // Create and save the MCQ
    const newMCQ = new MCQ({
      ...mcqData,
    });

    const savedMCQ = await newMCQ.save();
    res.status(201).json(savedMCQ);
  } catch (error) {
    console.error("Error generating MCQ:", error);
    res.status(500).json({
      message: "Error generating MCQ",
      error: error.message,
    });
  }
};
// Get all MCQs
const getMCQs = async (req, res) => {
  try {
    const mcqs = await MCQ.find({}).sort({ createdAt: -1 });
    res.status(200).json(mcqs);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching MCQs", error: error.message });
  }
};

// Get an MCQ by ID
const getMCQById = async (req, res) => {
  try {
    const mcq = await MCQ.findById(req.params.id);

    if (!mcq) {
      return res.status(404).json({ message: "MCQ not found" });
    }

    res.status(200).json(mcq);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching MCQ", error: error.message });
  }
};

module.exports = {
  generateMCQ,
  getMCQs,
  getMCQById,
};
