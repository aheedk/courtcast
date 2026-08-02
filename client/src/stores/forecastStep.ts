import { useEffect, useState } from 'react';

export type ForecastStepHours = 0.5 | 1 | 2;

const KEY = 'courtclimate.forecastStepHours';
const CHANGED_EVENT = 'courtclimate.forecastStep.changed';

function readStep(): ForecastStepHours {
  if (typeof window === 'undefined') return 1;
  const value = Number(window.localStorage.getItem(KEY));
  return value === 0.5 || value === 1 || value === 2 ? value : 1;
}

export function useForecastStep(): [ForecastStepHours, (step: ForecastStepHours) => void] {
  const [step, setStepState] = useState<ForecastStepHours>(1);

  useEffect(() => setStepState(readStep()), []);
  useEffect(() => {
    const onChange = () => setStepState(readStep());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const setStep = (next: ForecastStepHours) => {
    setStepState(next);
    window.localStorage.setItem(KEY, String(next));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };

  return [step, setStep];
}
