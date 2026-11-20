import { useState } from "react";
import { civilInstants, localDate } from "../astro/time";
export function TimeEditor({
  ms,
  zone,
  save,
}: {
  ms: number;
  zone: string;
  save: (n: number) => void;
}) {
  const [input, setInput] = useState(
      localDate(ms, zone).toFormat("yyyy-MM-dd'T'HH:mm"),
    ),
    [error, setError] = useState("");
  const [options, setOptions] = useState<ReturnType<typeof civilInstants>>([]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const choices = civilInstants(input, zone);
          if (choices.length === 1) save(+choices[0]);
          else setOptions(choices);
          setError("");
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label>
        Local date and time
        <input
          required
          type="datetime-local"
          min="1900-01-01T00:00"
          max="2100-12-31T23:59"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOptions([]);
            setError("");
          }}
        />
      </label>
      <p className="hint">{zone}</p>
      {error && <p role="alert">{error}</p>}
      {options.length ? (
        <>
          <p>This hour occurs twice. Choose the UTC offset.</p>
          {options.map((d, i) => (
            <button key={+d} type="button" onClick={() => save(+d)}>
              {i === 0 ? "First" : "Second"} occurrence · UTC{d.toFormat("ZZ")}
            </button>
          ))}
        </>
      ) : (
        <button className="primary">Apply time</button>
      )}
    </form>
  );
}
