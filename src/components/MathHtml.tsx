type MathHtmlProps = {
  html: string
  className?: string
  title?: string
}

export function MathHtml({ html, className, title }: MathHtmlProps) {
  return (
    <div
      className={className}
      title={title}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
