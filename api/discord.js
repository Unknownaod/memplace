export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const response = await fetch(
      "http://us2.bot-hosting.net:20010/discord-status",
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Discord bot returned ${response.status}`
      );
    }

    const data = await response.json();

    return res.status(200).json(data);

  } catch (error) {

    console.error(
      "Discord API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to retrieve Discord server status"
    });

  }
}
