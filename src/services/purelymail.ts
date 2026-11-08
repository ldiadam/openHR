import { Bindings } from '../types';

export interface CreateMailboxParams {
  userName: string;
  domainName: string;
  password?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
}

export interface PurelymailResult {
  success: boolean;
  simulated: boolean;
  message?: string;
  details?: any;
}

/**
 * Provisions a company mailbox via the Purelymail API v0.
 * Ref: news.purelymail.com/api/index.html - POST /api/v0/createUser
 *
 * If PURELYMAIL_API_TOKEN is not configured, gracefully falls back and logs,
 * allowing HR onboarding to proceed seamlessly without crashing.
 */
export async function createPurelymailUser(
  env: Bindings,
  params: CreateMailboxParams
): Promise<PurelymailResult> {
  const apiToken = env.PURELYMAIL_API_TOKEN;
  const baseUrl = env.PURELYMAIL_API_BASE_URL || 'https://purelymail.com';
  const domainName = params.domainName || env.PURELYMAIL_DOMAIN || 'company.id';

  if (!apiToken) {
    console.log(
      `[Purelymail Service] PURELYMAIL_API_TOKEN is not configured. Simulating mailbox creation for ${params.userName}@${domainName}.`
    );
    return {
      success: true,
      simulated: true,
      message: `Simulasi provisioning mailbox: ${params.userName}@${domainName}`,
    };
  }

  const generatedPassword =
    params.password ||
    `P@ss${Math.random().toString(36).substring(2, 10)}${Math.floor(100 + Math.random() * 900)}!`;

  const payload = {
    userName: params.userName,
    domainName: domainName,
    password: generatedPassword,
    enablePasswordReset: true,
    recoveryEmail: params.recoveryEmail || undefined,
    recoveryPhone: params.recoveryPhone || undefined,
    enableSearchIndexing: true,
    sendWelcomeEmail: false, // Sent via openHR SMTP with brand styling
  };

  try {
    const response = await fetch(`${baseUrl}/api/v0/createUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Purelymail-Api-Token': apiToken,
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();

    if (!response.ok || data.type === 'error' || data.error) {
      const errMsg = data.message || data.error || `HTTP ${response.status}`;
      console.error(`[Purelymail API Error] Failed to create user ${params.userName}@${domainName}: ${errMsg}`);
      return {
        success: false,
        simulated: false,
        message: errMsg,
        details: data,
      };
    }

    console.log(`[Purelymail Service] Successfully created mailbox: ${params.userName}@${domainName}`);
    return {
      success: true,
      simulated: false,
      message: `Mailbox ${params.userName}@${domainName} berhasil dibuat.`,
      details: data,
    };
  } catch (error: any) {
    console.error(`[Purelymail API Network Error]: ${error.message || error}`);
    return {
      success: false,
      simulated: false,
      message: `Gagal menghubungi API Purelymail: ${error.message || 'Network error'}`,
    };
  }
}
