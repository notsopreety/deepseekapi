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
app.get("/", (req, res) => {
  res.send("Online!");
});

app.get("/api/titlegenerator", async (req, res) => {
    try {
      // Extract 'content' query parameter
      const { content } = req.query;
      if (!content) {
        return res.status(400).json({ error: "Missing 'content' query parameter." });
      }
  
      // Build payload with dynamic user content
      const payload = {
        model: "deepseek-v3",
        messages: [
          {
            role: "system",
            content:
              "You are a title generator. Generate a concise, descriptive title (3-5 words) for this conversation based on the user message. Respond with just the title, no quotes, no punctuation, no explanations."
          },
          {
            role: "user",
            content: content
          }
        ],
        stream: false
      };
  
      // Send POST request to DeepSeek API
      const response = await axios.post("https://www.deepseekapp.io/v1/chat/completions", payload);
  
      // Extract the title from the response data
      const title =
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message &&
        response.data.choices[0].message.content
          ? response.data.choices[0].message.content.trim()
          : "No title generated";
  
      // Return the generated title
      res.json({
        status: "success",
        model: "deepseek-v3",
        title
      });
    } catch (error) {
      console.error("Error generating title:", error.message);
      res.status(500).json({
        status: "error",
        message: "Internal server error."
      });
    }
});
// Start the server on port 3000
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
