export interface ProviderCallResponse {
  callId: string;
}

export interface ProviderInterface {
  startCall(payload: { to: string; scriptId: string; webhookUrl: string }): Promise<ProviderCallResponse>;
}
