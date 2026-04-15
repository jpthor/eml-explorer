type CodeBlockProps = {
  text: string
  className?: string
  title?: string
  testId?: string
}

export function CodeBlock({ text, className, title, testId }: CodeBlockProps) {
  return (
    <pre className={className} title={title} data-testid={testId}>
      <code>{text}</code>
    </pre>
  )
}
