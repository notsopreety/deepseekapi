const express = require("express");
const axios = require("axios");

const app = express();

// GET endpoint at /api/deepseek
app.get("/api/deepseek", async (req, res) => {
  try {
    // Retrieve query parameters: prompt and history
    const { prompt, history } = req.query;
    const model = req.query.model || "deepseek-v3";
    if (!prompt || !history) {
      return res.status(400).json({
        error: "Missing prompt or history query parameter.",
        example: "/api/deepseek?prompt=Hello&history=[]",
        availableModels: ["deepseek-v3", "deepseek-r1", "deepseek-llm-67b-chat"]
    });
    }

    // Parse the history query parameter (must be a JSON-encoded array)
    let parsedHistory;
    try {
      parsedHistory = JSON.parse(history);
      if (!Array.isArray(parsedHistory)) {
        throw new Error("History must be an array");
      }
    } catch (err) {
      return res.status(400).json({ error: "Invalid history JSON format." });
    }

    // Append the prompt as a new user message to the conversation history
    const messages = [
      ...parsedHistory,
      { role: "user", content: prompt }
    ];

    // Call DeepSeek API with streaming enabled
    const deepseekResponse = await axios.post(
      "https://www.deepseekapp.io/v1/chat/completions",
      {
        model: model,
        messages,
        stream: true
      },
      {
        responseType: "stream"
      }
    );

    let fullResponse = "";
    let buffer = "";

    // Listen for data events from the stream
    deepseekResponse.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Retain the last (possibly incomplete) line in the buffer
      buffer = lines.pop();

      for (let line of lines) {
        line = line.trim();
        // DeepSeek sends lines prefixed with "data:"
        if (line.startsWith("data:")) {
          const dataStr = line.substring(5).trim();
          // Skip if stream signals "[DONE]"
          if (dataStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(dataStr);
            // Each chunk contains a delta with some text content
            if (parsed.choices && parsed.choices[0]?.delta?.content) {
              fullResponse += parsed.choices[0].delta.content;
            }
          } catch (e) {
            console.error("JSON parse error:", e);
          }
        }
      }
    });

    // When streaming ends, return the aggregated response along with updated history
    deepseekResponse.data.on("end", () => {
      // Create updated history: previous messages, current prompt, and assistant's response
      const updatedHistory = [
        ...parsedHistory,
        { role: "user", content: prompt },
        { role: "assistant", content: fullResponse }
      ];
      res.json({
        status: "success",
        model: "deepseek-v3",
        response: fullResponse,
        history: updatedHistory
      });
    });

    // Handle any stream errors
    deepseekResponse.data.on("error", (err) => {
      console.error("Stream error:", err);
      res.status(500).json({ error: "Error streaming response from DeepSeek API." });
    });
  } catch (error) {
    console.error("Internal error:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Start the server on port 3000
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
