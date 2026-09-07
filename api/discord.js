export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const botUrl =
      "http://us2.bot-hosting.net:20010/discord-status";

    const response = await fetch(botUrl, {
      method: "GET",
      cache: "no-store"
    });

    const text = await response.text();

    if (!response.ok) {
      console.error(
        "Discord bot returned:",
        response.status,
        text
      );

      return res.status(502).json({
        success: false,
        error: "Discord bot returned an error",
        status: response.status,
        details: text
      });
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.error(
        "Discord bot returned invalid JSON:",
        text
      );

      return res.status(502).json({
        success: false,
        error: "Discord bot returned invalid JSON"
      });
    }

    return res.status(200).json(data);

  } catch (error) {

    console.error(
      "Discord proxy error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to connect to Discord bot",
      message: error.message
    });
  }
}
