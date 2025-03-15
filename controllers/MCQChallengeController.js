const MCQ = require("../models/MCQChallengeSchema");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Preprocess markdown to ensure proper formatting
const preprocessMarkdown = (markdown) => {
  if (!markdown) return "";

  // Improve table formatting
  // First, ensure there's proper spacing in table cells and align columns
  let processed = markdown.replace(/\|\s*([^|]*)\s*\|/g, "| $1 |");

  // Make sure tables have proper markdown format with header separators
  processed = processed.replace(
    /(\|\s*[\w\s]+\s*\|)(\s*\n\s*\|)/g,
    (match, header, nextLine) => {
      // Count the number of columns in the header row
      const columnCount = header.match(/\|/g).length - 1;

      // If the next line doesn't have separator dashes, insert them
      if (!nextLine.includes("-")) {
        let separatorRow = "|";
        for (let i = 0; i < columnCount; i++) {
          separatorRow += "---------|";
        }
        return header + "\n" + separatorRow + nextLine;
      }
      return match;
    }
  );

  // Format SQL tables in code blocks to ensure they render properly
  processed = processed.replace(
    /```sql\s*([\s\S]*?)(CREATE TABLE|SELECT|INSERT|UPDATE|DELETE)[\s\S]*?```/gi,
    (match, prefix, sqlStatement) => {
      // Check if there's a table in regular markdown format within the SQL code block
      if (match.includes("|")) {
        // Make sure the table markdown is properly formatted with spacing
        return match.replace(/\|\s*([^|]*)\s*\|/g, "| $1 |");
      }
      return match;
    }
  );

  // Ensure SQL tables outside code blocks are properly formatted
  processed = processed.replace(
    /(\|\s*[\w\s]+\s*\|\s*\n)(?!\|[-|]*\|)/g,
    (match, tableLine) => {
      // Count columns in the table line
      const columns = tableLine.match(/\|/g).length - 1;

      // Create a separator row
      let separator = "|";
      for (let i = 0; i < columns; i++) {
        separator += "---------|";
      }

      return tableLine + separator + "\n";
    }
  );

  // Ensure code blocks are correctly formatted
  processed = processed.replace(/```(\s*)\n/g, "```\n"); // Normalize accidental extra spaces in code blocks

  // Fix cases where text continues inside a code block
  processed = processed.replace(
    /(```[\w+][\s\S]+?)(```)([^\n])/g,
    "$1$2\n\n$3"
  );

  // Ensure SQL keywords are uppercase inside SQL code blocks
  processed = processed.replace(/```sql([\s\S]*?)```/gi, (match, p1) => {
    const uppercased = p1.replace(
      /\b(select|from|where|join|inner|outer|left|right|on|and|or|group by|order by|having|limit|insert|update|delete|create|alter|drop|table|view|index|into|values|set)\b/gi,
      (keyword) => keyword.toUpperCase()
    );
    return "```sql\n" + uppercased.trim() + "\n```";
  });

  return processed;
};

// Generate MCQ
const generateMCQ = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4", // Using a more powerful model for higher quality
      messages: [
        {
          role: "system",
          content: `You are an expert computer science instructor. Your task is to create high-quality multiple-choice questions based on the user's prompt. Follow these guidelines strictly:

1. Create an MCQ with exactly 4 options (A, B, C, D) with only one correct answer.
2. Make sure the MCQ is educational and professionally written.
3. Use markdown formatting for any code snippets with proper language tags (e.g., \`\`\`sql, \`\`\`python)
4. For SQL tables and database questions:
   - Format as markdown tables with proper column alignment
   - Include column headers with proper capitalization
   - Use consistent spacing in table cells
   - Show complete CREATE TABLE statements when relevant
   - Format SQL keywords in UPPERCASE for readability
   - IMPORTANT: Ensure all tables have the markdown header separator row with dashes like:
     | Column1 | Column2 |
     |---------|---------|
     | value1  | value2  |
5. Include a detailed explanation for the correct answer that teaches the underlying concepts.

When showing SQL tables, use this EXACT format with the separator row:
\`\`\`
| Column1 | Column2 | Column3 |
|---------|---------|---------|
| value1  | value2  | value3  |
| value4  | value5  | value6  |
\`\`\`

For SQL-specific questions:
- Always include the table structure/schema
- Use realistic but simple data values
- In explanations, break down the query step by step
- Explain concepts like JOIN types, WHERE conditions, aggregations clearly

Format your response as follows:
TITLE: [Title of the MCQ]
DIFFICULTY: [Easy/Medium/Hard]
QUESTION: [Question text with any code snippets or tables]
OPTIONS:
A: [Option A text]
B: [Option B text]
C: [Option C text]
D: [Option D text]
CORRECT: [Correct option letter]
EXPLANATION: [Detailed explanation]`,
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
    console.log("Raw AI Response:", aiResponse);

    // Parse the response into a structured format
    const titleMatch = aiResponse.match(/TITLE:\s*(.*)/i);
    const difficultyMatch = aiResponse.match(/DIFFICULTY:\s*(.*)/i);
    const questionMatch = aiResponse.match(
      /QUESTION:\s*([\s\S]*?)(?=OPTIONS:|$)/i
    );
    const optionsMatch = aiResponse.match(
      /OPTIONS:\s*([\s\S]*?)(?=CORRECT:|$)/i
    );
    const correctMatch = aiResponse.match(/CORRECT:\s*(.*)/i);
    const explanationMatch = aiResponse.match(
      /EXPLANATION:\s*([\s\S]*?)(?=$)/i
    );

    if (
      !titleMatch ||
      !difficultyMatch ||
      !questionMatch ||
      !optionsMatch ||
      !correctMatch ||
      !explanationMatch
    ) {
      return res
        .status(500)
        .json({ message: "Invalid response format from AI" });
    }

    // Extract the options
    const optionsText = optionsMatch[1].trim();
    const optionsArray = [];

    // Match each option with its content
    const optionRegex = /([A-D]):\s*([\s\S]*?)(?=(?:[A-D]:|$))/g;
    let optionMatch;
    while ((optionMatch = optionRegex.exec(optionsText)) !== null) {
      optionsArray.push({
        id: optionMatch[1],
        text: preprocessMarkdown(optionMatch[2].trim()),
      });
    }

    // Ensure we have exactly 4 options
    if (optionsArray.length !== 4) {
      return res
        .status(500)
        .json({ message: "Invalid number of options in AI response" });
    }

    // Create the MCQ object with preprocessed markdown
    const mcqData = {
      title: titleMatch[1].trim(),
      difficultyLevel: difficultyMatch[1].trim(),
      question: preprocessMarkdown(questionMatch[1].trim()),
      options: optionsArray,
      correctOptionId: correctMatch[1].trim(),
      explanation: preprocessMarkdown(explanationMatch[1].trim()),
      prompt,
    };

    console.log("Parsed MCQ Data:", mcqData);

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
