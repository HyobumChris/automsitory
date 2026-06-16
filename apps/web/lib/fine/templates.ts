export function buildDraftSubject(params: {
  vehicleNumber: string;
  paymentDeadline: string;
}): string {
  return `[과속과징금 안내] 차량 ${params.vehicleNumber} / 납부기한 ${params.paymentDeadline}`;
}

export function buildDraftBody(params: {
  recipientEmail: string;
  vehicleNumber: string;
  paymentDeadline: string;
  violationDetails: string;
}): string {
  return [
    `${params.recipientEmail} 님,`,
    '',
    '과속/과징금 관련 문서가 접수되어 안내드립니다.',
    '',
    `- 차량번호: ${params.vehicleNumber}`,
    `- 납부기한: ${params.paymentDeadline}`,
    `- 위반사항: ${params.violationDetails}`,
    '',
    '첨부된 원본 고지서를 확인 후, 필요한 조치를 진행해 주세요.',
    '',
    '※ 본 메일은 시스템이 자동으로 Draft만 생성하며, 실제 발송은 담당자가 수동으로 수행합니다.',
  ].join('\n');
}
