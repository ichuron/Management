import { ComingSoon, PageTitle } from '../components/ui'

export function ReportPage() {
  return (
    <>
      <PageTitle>実績</PageTitle>
      <ComingSoon phase={3} items={['月の実績（予算比較・ペース・日別グラフ）', '年の実績（4月〜3月）', '一時出費の予定と実績']} />
    </>
  )
}
