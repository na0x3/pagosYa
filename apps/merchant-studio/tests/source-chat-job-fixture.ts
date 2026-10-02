/** Terminal job envelope for tests whose focus is the resulting conversation. Lifecycle tests use running jobs. */
export function finishedChatJob(body: any) {
  return body?.assistantMessage ? { id: 'test-chat-job', requestId: 'test-request', status: body.assistantMessage.metadata?.failed ? 'FAILED' : body.revision ? 'COMPLETED' : 'AWAITING_INPUT', sequence: 2, result: body } : body;
}
