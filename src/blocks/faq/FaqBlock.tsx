import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BlockConfig } from '../types'
import { defaultFaqItems } from '@/lib/block-default-content'

interface FaqItem {
  question: string
  answer: string
}

interface FaqProps {
  title?: string
  subtitle?: string
  items?: FaqItem[]
}

// ISS-005: fallback FAQs are the block-default-content contract, shared with
// the prop normalizer (was an inline literal, value-identical).
const defaultFaqs = defaultFaqItems as FaqItem[]

function AccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border-subtle">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-left group"
      >
        <span className="text-[13.5px] font-medium text-text-0 group-hover:text-green transition-colors">
          {item.question}
        </span>
        <ChevronDown
          size={16}
          className={`text-text-3 shrink-0 ml-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-green' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[500px] pb-4' : 'max-h-0'
        }`}
      >
        <p className="text-[12.5px] text-text-2 leading-relaxed pr-8">
          {item.answer}
        </p>
      </div>
    </div>
  )
}

export function FaqBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as FaqProps
  const items = props.items || defaultFaqs
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="px-6 @md:px-10 py-16 @md:py-20">
      <div className="reveal-fade-up reveal-d1 text-center mb-10">
        <h2 className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">
          {props.title || 'Frequently Asked Questions'}
        </h2>
        {props.subtitle && (
          <p className="text-text-2 text-sm max-w-lg mx-auto">{props.subtitle}</p>
        )}
      </div>

      <div className="max-w-2xl mx-auto">
        {items.map((item, i) => (
          <div key={i} className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)}`}>
            <AccordionItem
              item={item}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
