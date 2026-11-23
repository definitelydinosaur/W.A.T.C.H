const AI_PROVIDERS = ['gemini', 'groq', 'openrouter', 'anthropic'];

export function validateEnvironment(
  config: Record<string, string | undefined>,
) {
  const missing: string[] = [];
  if (!config.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL');
  if (
    !config.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    !config.SUPABASE_SERVICE_KEY?.trim()
  ) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
  }
  if (missing.length) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
    throw new Error(
      `Backend startup requires: ${missing.join(', ')}. Configure these names in the backend environment.`,
    );
  }

  const provider = config.AI_PROVIDER?.trim().toLowerCase() || 'gemini';
  if (!AI_PROVIDERS.includes(provider)) {
    throw new Error(
      'Invalid AI_PROVIDER. Choose gemini, groq, openrouter, or anthropic.',
    );
  }
  if (!config.AI_API_KEY?.trim()) {
    console.info(
      'AI_API_KEY is not set; AI-dependent features will use source/template fallbacks, while system-announcement formatting will be unavailable.',
    );
  }
  for (const name of ['EXPO_ACCESS_TOKEN', 'CHATBOT_API_URL', 'AI_BASE_URL']) {
    if (!config[name]?.trim()) {
      console.info(`Optional environment variable ${name} is not set.`);
    }
  }
  return config;
}
