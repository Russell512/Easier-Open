export const STATUS_LABELS: Record<string, string> = {
  Researching: '探索中', Shortlisted: '已列入/排除選校', Preparing: '準備申請', Submitted: '已送出',
  Interview: '面試中', Admitted: '已錄取', Rejected: '未錄取', Withdrawn: '已撤回',
  'Not started': '尚未開始', 'In progress': '進行中', 'Waiting on others': '等待回覆',
  Completed: '已完成', Verified: '已確認', 'Not needed': '不需要', Required: '需採計',
}
export const statusLabel = (value: string) => STATUS_LABELS[value] ?? value
