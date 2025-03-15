const mongoose = require("mongoose");

const mcqSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    difficultyLevel: {
      type: String,
      required: true,
      enum: ["Easy", "Medium", "Hard"],
    },
    question: {
      type: String,
      required: true,
    },
    options: [
      {
        id: String,
        text: String,
      },
    ],
    correctOptionId: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MCQ", mcqSchema);
