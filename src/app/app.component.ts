import { Component } from "@angular/core";
import { FormControl, FormGroup } from "@angular/forms";
import {
  startWith,
  switchMap,
  distinctUntilChanged,
  map,
  share,
  takeUntil,
  repeat,
  tap
} from "rxjs/operators";
import { combineLatest, Observable, Subject, timer, merge, of } from "rxjs";

interface LogEvent {
  important: boolean;
  message: string;
}

@Component({
  selector: "app-root",
  template: `
    <div class="sidebar">
      <h3>Heartbeat Enabled</h3>
      <mat-slide-toggle [formControl]="slideToggleControl"></mat-slide-toggle>

      <div class="settingsForm" [formGroup]="settingsControl">
        <mat-form-field>
          <input
            type="number"
            placeholder="Active Window"
            matInput
            formControlName="activeWindow"
          />
        </mat-form-field>
        <mat-form-field>
          <input
            type="number"
            placeholder="Recovery Window"
            matInput
            formControlName="recoveryWindow"
          />
        </mat-form-field>
        <mat-form-field>
          <input
            type="number"
            placeholder="Dim Level"
            matInput
            formControlName="dimLevel"
          />
        </mat-form-field>
      </div>

      <div class="controls">
        <button mat-flat-button color="primary" (click)="heartbeat$.next(0)">
          Send 0
        </button>
        <button mat-flat-button color="accent" (click)="heartbeat$.next(1)">
          Send 1
        </button>
      </div>
    </div>

    <div class="log">
      <div *ngFor="let event of events" [class.important]="event.important">
        {{ event.message }}
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
      }

      .sidebar {
        width: 260px;
        min-height: 100vh;
        flex-grow: 0;
        flex-shrink: 0;
        background-color: #181818;
        padding: 20px;
        color: white;
      }

      .settingsForm {
        margin: 12px 0;
      }

      .log {
        display: flex;
        flex-direction: column-reverse;
        padding: 20px;
        font-family: monospace;
        justify-content: flex-end;
      }

      .log div {
        margin-bottom: 10px;
        color: #424242;
      }

      .log div.important {
        color: #212121;
        font-weight: bold;
      }

      .controls button {
        margin-right: 8px;
      }
    `
  ]
})
export class AppComponent {
  slideToggleControl = new FormControl(false);
  settingsControl = new FormGroup({
    activeWindow: new FormControl(2500),
    recoveryWindow: new FormControl(7500),
    dimLevel: new FormControl(100)
  });
  heartbeat$ = new Subject<number>();
  status$: Observable<string>;
  events: LogEvent[] = [];

  ngOnInit() {
    const enabled$: Observable<
      boolean
    > = this.slideToggleControl.valueChanges.pipe(
      startWith(this.slideToggleControl.value)
    );
    const settings$: Observable<{
      activeWindow: number;
      recoveryWindow: number;
      dimLevel: number;
    }> = this.settingsControl.valueChanges.pipe(
      startWith(this.settingsControl.value)
    );

    this.heartbeat$.subscribe(result =>
      this.events.push({
        important: false,
        message: `Heartbeat received ${result}`
      })
    );

    this.status$ = combineLatest(enabled$, settings$).pipe(
      switchMap(([enabled, { activeWindow, recoveryWindow, dimLevel }]) => {
        this.events = [];

        if (!enabled) {
          this.events.push({
            important: true,
            message: "Entering uptime state"
          });

          return of("Uptime");
        }

        const distinctHearbeats$ = new Subject<number>();
        this.heartbeat$
          .pipe(distinctUntilChanged())
          .subscribe(distinctHearbeats$);
        const isDowntime$ = timer(activeWindow).pipe(
          map(() => "downtime"),
          takeUntil(distinctHearbeats$),
          repeat(),
          tap(() =>
            this.events.push({
              important: false,
              message: "Active window expired"
            })
          ),
          share()
        );

        const isUptime$ = isDowntime$.pipe(
          switchMap(() => {
            return timer(recoveryWindow).pipe(map(() => "uptime"));
          }),
          tap(() =>
            this.events.push({
              important: false,
              message: "Recovery window expired"
            })
          )
        );

        return merge(of("uptime"), isDowntime$, isUptime$).pipe(
          distinctUntilChanged(),
          tap(state =>
            this.events.push({
              important: true,
              message: `Entering ${state} state`
            })
          ),
          tap(state => {
            if (state === "downtime")
              this.events.push({
                important: false,
                message: `Dimming all zones to ${dimLevel}`
              });
          })
        );
      })
    );

    this.status$.subscribe();
  }
}
