"use client";

import { useId } from "react";
import { Check, Coffee, Compass, Flame, Hand, Mountain, Sprout, Sun } from "lucide-react";
import { topics, type Level, type TopicId } from "@/lib/types";

const topicIcons = { coffee: Coffee, hand: Hand, compass: Compass, sun: Sun };
const difficultyIcons = { beginner: Sprout, intermediate: Flame, advanced: Mountain };
const difficultyOptions: { id: Level; name: string; description: string }[] = [
  { id: "beginner", name: "Beginner", description: "Simple words and phrases" },
  { id: "intermediate", name: "Intermediate", description: "Everyday conversations" },
  { id: "advanced", name: "Advanced", description: "More nuanced conversations" },
];

export type LessonOptionsProps = {
  topic: TopicId;
  level: Level;
  onTopicChange: (topic: TopicId) => void;
  onLevelChange: (level: Level) => void;
  disabled?: boolean;
};

export function LessonOptions({ topic, level, onTopicChange, onLevelChange, disabled = false }: LessonOptionsProps) {
  const id = useId();
  return <div className="lesson-options">
    <fieldset className="lesson-option-group" role="radiogroup" disabled={disabled}>
      <legend>Conversation</legend>
      <div className="lesson-topic-grid">
        {topics.map((item) => {
          const Icon = topicIcons[item.icon];
          return <label className={"lesson-option lesson-topic-option" + (topic === item.id ? " selected" : "")} key={item.id}>
            <input type="radio" name={id + "-topic"} value={item.id} checked={topic === item.id}
              aria-label={item.name} aria-describedby={id + "-" + item.id}
              onChange={() => onTopicChange(item.id)} />
            <span className="lesson-topic-icon" aria-hidden="true"><Icon size={18} /></span>
            <span className="lesson-option-copy"><strong>{item.name}</strong><small id={id + "-" + item.id}>{item.description}</small></span>
            <Check size={14} className="lesson-option-check" aria-hidden="true" />
          </label>;
        })}
      </div>
    </fieldset>
    <fieldset className="lesson-option-group" role="radiogroup" disabled={disabled}>
      <legend>Difficulty</legend>
      <div className="lesson-difficulty-grid">
        {difficultyOptions.map((item) => {
          const Icon = difficultyIcons[item.id];
          return <label className={"lesson-option lesson-difficulty-option lesson-difficulty-" + item.id + (level === item.id ? " selected" : "")} key={item.id}>
            <input type="radio" name={id + "-level"} value={item.id} checked={level === item.id}
              aria-label={item.name} aria-describedby={id + "-" + item.id}
              onChange={() => onLevelChange(item.id)} />
            <span className="lesson-difficulty-icon" aria-hidden="true"><Icon size={17} /></span>
            <span className="lesson-option-copy"><strong>{item.name}</strong><small id={id + "-" + item.id}>{item.description}</small></span>
            <Check size={14} className="lesson-option-check" aria-hidden="true" />
          </label>;
        })}
      </div>
    </fieldset>
  </div>;
}
