import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, CheckCircle2, XCircle, ChevronRight, GraduationCap } from 'lucide-react';

const LEARNING_BASE = '/learning';

export default function LearningPanel() {
  const [modules, setModules] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [moduleContent, setModuleContent] = useState('');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [quizResult, setQuizResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [indexRes, quizRes] = await Promise.all([
          fetch(`${LEARNING_BASE}/modules_index.json`),
          fetch(`${LEARNING_BASE}/quiz_bank.json`),
        ]);
        if (!indexRes.ok || !quizRes.ok) {
          throw new Error('Learning data not found. Run the Python pipeline to generate learning/ output.');
        }
        const index = await indexRes.json();
        const quizData = await quizRes.json();
        setModules(index.modules || []);
        setQuizzes(quizData);
        if (index.modules?.length) {
          setSelectedModuleId(index.modules[0].module_id);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedModuleId) return;
    const mod = modules.find((m) => m.module_id === selectedModuleId);
    if (!mod?.file) return;

    fetch(`${LEARNING_BASE}/${mod.file}`)
      .then((r) => r.text())
      .then(setModuleContent)
      .catch(() => setModuleContent('Could not load module content.'));
  }, [selectedModuleId, modules]);

  const moduleQuizzes = quizzes.filter(
    (q) => q.module_id === selectedModuleId
      || (mod => mod && q.measure_ids?.some((id) => mod.measure_ids?.includes(id)))(
        modules.find((m) => m.module_id === selectedModuleId),
      ),
  );

  const handleSubmitQuiz = useCallback(() => {
    if (!activeQuiz || selectedAnswer === null) return;
    const correct = selectedAnswer === activeQuiz.correct_answer;
    setQuizResult({ correct, explanation_ko: activeQuiz.explanation_ko, explanation_en: activeQuiz.explanation_en });
  }, [activeQuiz, selectedAnswer]);

  const startQuiz = useCallback((quiz) => {
    setActiveQuiz(quiz);
    setSelectedAnswer(null);
    setQuizResult(null);
  }, []);

  const selectedModule = modules.find((m) => m.module_id === selectedModuleId);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        Loading NDT learning modules…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <GraduationCap size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm text-slate-400">{error}</p>
          <p className="text-xs text-slate-600 mt-2">
            Generate modules: cd lr-hatch-coaming-measures && python3 run_e2e.py
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Module list */}
      <div className="w-[300px] shrink-0 border-r border-slate-700/30 bg-marine-800/30 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-700/30">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <BookOpen size={14} className="text-cyan-400" />
            NDT Learning Modules
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {modules.map((mod) => {
            const active = mod.module_id === selectedModuleId;
            return (
              <button
                key={mod.module_id}
                type="button"
                onClick={() => {
                  setSelectedModuleId(mod.module_id);
                  setActiveQuiz(null);
                  setQuizResult(null);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-200'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                }`}
              >
                <div className="font-semibold leading-snug">{mod.title_ko}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{mod.title_en}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500">
                    {mod.difficulty}
                  </span>
                  {mod.measure_ids?.map((id) => (
                    <span key={id} className="text-[9px] text-slate-600">M{id}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content + Quiz */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedModule && (
          <div className="shrink-0 px-5 py-3 border-b border-slate-700/20 bg-marine-800/20">
            <h2 className="text-sm font-bold text-slate-200">{selectedModule.title_ko}</h2>
            <p className="text-[11px] text-slate-500">{selectedModule.title_en}</p>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Markdown content (rendered as preformatted) */}
          <div className="flex-1 overflow-y-auto p-5">
            <pre className="text-[11px] text-slate-400 whitespace-pre-wrap font-sans leading-relaxed max-w-3xl">
              {moduleContent}
            </pre>
          </div>

          {/* Quiz sidebar */}
          <div className="w-[340px] shrink-0 border-l border-slate-700/30 bg-marine-800/20 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-700/30">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Quiz ({moduleQuizzes.length})
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!activeQuiz && moduleQuizzes.map((quiz) => (
                <button
                  key={quiz.quiz_id}
                  type="button"
                  onClick={() => startQuiz(quiz)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30 hover:border-cyan-500/30 text-xs text-slate-300 cursor-pointer transition-colors"
                >
                  <div className="font-medium line-clamp-2">{quiz.question_ko}</div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    {quiz.question_type}
                    <ChevronRight size={10} />
                  </div>
                </button>
              ))}

              <AnimatePresence mode="wait">
                {activeQuiz && (
                  <motion.div
                    key={activeQuiz.quiz_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <p className="text-xs text-slate-300 font-medium">{activeQuiz.question_ko}</p>
                    <p className="text-[10px] text-slate-500">{activeQuiz.question_en}</p>

                    <div className="space-y-1.5">
                      {activeQuiz.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => !quizResult && setSelectedAnswer(opt)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-[11px] border transition-colors cursor-pointer ${
                            selectedAnswer === opt
                              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                              : 'border-slate-700/40 text-slate-400 hover:border-slate-600'
                          } ${
                            quizResult && opt === activeQuiz.correct_answer
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                              : ''
                          } ${
                            quizResult && selectedAnswer === opt && opt !== activeQuiz.correct_answer
                              ? 'border-red-500/50 bg-red-500/10 text-red-300'
                              : ''
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    {!quizResult && (
                      <button
                        type="button"
                        onClick={handleSubmitQuiz}
                        disabled={selectedAnswer === null}
                        className="w-full py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Submit Answer
                      </button>
                    )}

                    {quizResult && (
                      <div className={`p-3 rounded-lg border text-xs ${
                        quizResult.correct
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-red-500/30 bg-red-500/10 text-red-300'
                      }`}
                      >
                        <div className="flex items-center gap-2 font-semibold mb-1">
                          {quizResult.correct
                            ? <><CheckCircle2 size={14} /> Correct</>
                            : <><XCircle size={14} /> Incorrect</>}
                        </div>
                        <p className="text-[10px] opacity-90">{quizResult.explanation_ko}</p>
                        <p className="text-[10px] opacity-70 mt-1">{quizResult.explanation_en}</p>
                        <button
                          type="button"
                          onClick={() => { setActiveQuiz(null); setQuizResult(null); }}
                          className="mt-2 text-[10px] text-slate-400 underline cursor-pointer"
                        >
                          Back to quiz list
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
