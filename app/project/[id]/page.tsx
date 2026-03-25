'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Question {
  id: string;
  text: string;
  orderNum: number;
  answer?: { content: string };
}

export default function ProjectPage() {
  const params = useParams();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/project/${params.id}`)
      .then(res => res.json())
      .then(setQuestions);
  }, [params.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    await fetch(`/api/generate/${params.id}`, { method: 'POST' });
    const res = await fetch(`/api/project/${params.id}`);
    setQuestions(await res.json());
    setGenerating(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">问卷详情</h1>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {generating ? '生成中...' : '生成答案'}
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="bg-white rounded-lg shadow p-6">
              <div className="font-semibold text-gray-900 mb-2">
                {q.orderNum}. {q.text}
              </div>
              {q.answer ? (
                <div className="text-gray-700 mt-2 whitespace-pre-wrap">
                  {q.answer.content}
                </div>
              ) : (
                <div className="text-gray-400 mt-2">未生成答案</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
