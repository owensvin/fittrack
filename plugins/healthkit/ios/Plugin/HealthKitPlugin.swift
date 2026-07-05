import Foundation
import Capacitor
#if canImport(HealthKit)
import HealthKit
#endif

/// Read-only HealthKit bridge: body mass (weight), step count, and sleep
/// analysis. FitTrack never writes to HealthKit — this only pulls samples in,
/// one-way, so the scale/other apps stay the source of truth.
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin {
    #if canImport(HealthKit)
    private let store = HKHealthStore()

    private func typesFor(_ kinds: [String]) -> Set<HKObjectType> {
        var set = Set<HKObjectType>()
        if kinds.contains("weight"), let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { set.insert(t) }
        if kinds.contains("steps"), let t = HKObjectType.quantityType(forIdentifier: .stepCount) { set.insert(t) }
        if kinds.contains("sleep"), let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { set.insert(t) }
        return set
    }
    #endif

    @objc func availability(_ call: CAPPluginCall) {
        #if canImport(HealthKit)
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
        #else
        call.resolve(["available": false])
        #endif
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        #if canImport(HealthKit)
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false]); return
        }
        let kinds = call.getArray("read", String.self) ?? ["weight", "steps", "sleep"]
        let types = typesFor(kinds)
        store.requestAuthorization(toShare: nil, read: types) { granted, error in
            call.resolve(["granted": granted, "error": error?.localizedDescription ?? NSNull()])
        }
        #else
        call.resolve(["granted": false])
        #endif
    }

    @objc func queryWeight(_ call: CAPPluginCall) {
        #if canImport(HealthKit)
        guard let type = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("bodyMass type unavailable"); return
        }
        let since = isoDate(call.getString("since"))
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error { call.reject("query failed: \(error.localizedDescription)"); return }
            let out = (samples as? [HKQuantitySample] ?? []).map { s -> [String: Any] in
                ["kg": s.quantity.doubleValue(for: .gramUnit(with: .kilo)), "date": ISO8601DateFormatter().string(from: s.startDate)]
            }
            call.resolve(["samples": out])
        }
        store.execute(query)
        #else
        call.resolve(["samples": []])
        #endif
    }

    @objc func querySteps(_ call: CAPPluginCall) {
        #if canImport(HealthKit)
        guard let type = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            call.reject("stepCount type unavailable"); return
        }
        let since = startOfDay(isoDate(call.getString("since")))
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        var interval = DateComponents(); interval.day = 1
        let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum, anchorDate: startOfDay(Date()), intervalComponents: interval)
        query.initialResultsHandler = { _, results, error in
            if let error = error { call.reject("query failed: \(error.localizedDescription)"); return }
            var out: [[String: Any]] = []
            results?.enumerateStatistics(from: since, to: Date()) { stat, _ in
                if let sum = stat.sumQuantity() {
                    out.append(["date": Self.dayKey(stat.startDate), "steps": Int(sum.doubleValue(for: .count()))])
                }
            }
            call.resolve(["days": out])
        }
        store.execute(query)
        #else
        call.resolve(["days": []])
        #endif
    }

    @objc func querySleep(_ call: CAPPluginCall) {
        #if canImport(HealthKit)
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("sleepAnalysis type unavailable"); return
        }
        let since = isoDate(call.getString("since"))
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error = error { call.reject("query failed: \(error.localizedDescription)"); return }
            // Bucket "asleep" segments by the calendar day they end on, summed in hours.
            var perDay: [String: Double] = [:]
            for case let s as HKCategorySample in (samples ?? []) {
                let asleep: Bool
                if #available(iOS 16.0, *) {
                    asleep = s.value != HKCategoryValueSleepAnalysis.awake.rawValue && s.value != HKCategoryValueSleepAnalysis.inBed.rawValue
                } else {
                    // Pre-iOS-16 HealthKit only had one "asleep" value (.asleep);
                    // the granular .asleepUnspecified/.asleepCore/etc. replaced it in 16.0.
                    asleep = s.value == HKCategoryValueSleepAnalysis.asleep.rawValue
                }
                guard asleep else { continue }
                let hours = s.endDate.timeIntervalSince(s.startDate) / 3600.0
                let key = Self.dayKey(s.endDate)
                perDay[key, default: 0] += hours
            }
            let out = perDay.map { ["date": $0.key, "hours": $0.value] }
            call.resolve(["days": out])
        }
        store.execute(query)
        #else
        call.resolve(["days": []])
        #endif
    }

    #if canImport(HealthKit)
    private func isoDate(_ s: String?) -> Date {
        guard let s = s, let d = ISO8601DateFormatter().date(from: s) else {
            return Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
        }
        return d
    }
    private func startOfDay(_ d: Date) -> Date { Calendar.current.startOfDay(for: d) }
    private static func dayKey(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.calendar = Calendar(identifier: .gregorian)
        return f.string(from: d)
    }
    #endif
}
