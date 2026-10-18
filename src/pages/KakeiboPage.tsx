import { formatJpDate, periodOf, todayTokyo } from '../lib/date'
import { ComingSoon, PageTitle } from '../components/ui'

export function KakeiboPage() {
  const today = todayTokyo()
  const period = periodOf(today)
  return (
    <>
      <PageTitle>
        {period.year}年{period.month}月
      </PageTitle>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">今日は {formatJpDate(today)}</p>
      <ComingSoon phase={2} items={['月のカレンダーと日ごとの支出合計', '今月の要約（支出・残り予算・1日あたり使える額）', '記録の入力・編集・削除']} />
    </>
  )
}
