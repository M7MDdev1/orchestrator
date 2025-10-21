import axios from 'axios';
import { ProviderInterface, ProviderCallResponse } from './provider.interface';

export class HttpProvider implements ProviderInterface {
  constructor(private baseUrl: string) {}

  async startCall(payload: { to: string; scriptId: string; webhookUrl: string }): Promise<ProviderCallResponse> {
    const url = `${this.baseUrl}/api/v1/calls`;
    const resp = await axios.post(url, payload, { timeout: 10_000 });
    if (![200, 202].includes(resp.status)) throw new Error('provider reject');
    const callId = resp.data?.callId;
    if (!callId) throw new Error('provider missing callId');
    return { callId };
  }
}
