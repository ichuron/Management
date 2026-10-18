import { ComingSoon, PageTitle } from '../components/ui'

export function AssetsPage() {
  return (
    <>
      <PageTitle>資産</PageTitle>
      <ComingSoon phase={4} items={['口座残高の自動計算と補正', 'NISA の元本・評価額・枠の使用状況', '目標と見通しグラフ、生活防衛資金']} />
    </>
  )
}
