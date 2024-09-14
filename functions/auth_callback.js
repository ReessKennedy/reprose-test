export async function onRequest({ request, env }) {
  const code = new URL(request.url).searchParams.get("code");

  try {
    return Response.json({
      method: "POST",
      headers: {
        accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_APP_CLIENT_ID,
        client_secret: env.GITHUB_APP_CLIENT_SECRET,
        redirect_uri: env.REDIRECT_URI,
        code,
      }),
    });

    const response = await fetch(
      `${env.GITHUB_SITE_URL}/login/oauth/access_token`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_APP_CLIENT_ID,
          client_secret: env.GITHUB_APP_CLIENT_SECRET,
          redirect_uri: env.REDIRECT_URI,
          code,
        }),
      },
    );

    return Response.json(await response.json());
  } catch (error) {
    return new Response(String(error));
  }
}
